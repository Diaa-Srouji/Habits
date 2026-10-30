// Everything that talks to Firebase: sign-in, per-habit cloud documents, live updates, offline protection.
//
// Cloud layout (per signed-in user):
//   users/{uid}                    OLD single document {data,cats,updated}. Read once for the move, never written again: it is the backup.
//   users/{uid}/habits/{habitId}   one document per habit
//   users/{uid}/meta/categories    {cats:{<id>:{...}}, schema:2 ...}. Its existence means "the move is done".
//
// How edits stay safe:
// * base = the last version of each habit that the cloud has CONFIRMED. Unsent edits = difference(base, S.habits), field by field (a field is a
//   setting, or one date inside done / skip / off / notes).
// * Saving sends only those fields (updateDoc), so two devices that change different habits, or different days of the same habit, never overwrite each other.
// * News from the cloud is laid down first and this device's unsent edits are put back on top, so nothing typed offline is lost.
// * habits + base live in localStorage too, so offline edits survive a reload and go out when the connection is back.
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import {getFirestore,doc,collection,setDoc,updateDoc,deleteDoc,deleteField,FieldPath,onSnapshot,getDocFromServer,writeBatch,runTransaction} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
import {S,resetState} from './state.js';
import {loadCats,loadGrps} from './categories.js';
import {HABIT_MAPS as HM,CATS_MAPS as CM,clone,same,toHabit,sortHabits,diff,apply,rebase,catsToDoc,docToCats,docToGrps,normCats,planMigration} from './docs.js';

const OLD='habit-tracker-v2',NEW='habit-tracker-v3',SIZE_WARN=800000,BATCH=400;   // Firestore: 1 MB per document, 500 writes per batch
const fbApp=initializeApp(firebaseConfig),auth=getAuth(fbApp),db=getFirestore(fbApp);

let uid=null,habitsRef=null,catsRef=null,unsubs=[],cbs={},timer=null,retry=null;
let ready=false,flushing=false,again=false,migrating=false,needMove=false,seenServer=false,syncing=true,big=false;
let base=new Map(),catsBase=null;   // last cloud-confirmed copies: habits by id, and the categories document

export const signIn=(email,pass)=>signInWithEmailAndPassword(auth,email,pass);
export const signUp=(email,pass)=>createUserWithEmailAndPassword(auth,email,pass);
export const logOut=()=>signOut(auth);
export const sendReset=email=>sendPasswordResetEmail(auth,email);
export const setSync=t=>{const e=document.getElementById('sync');if(e)e.textContent=t};

// ---- this browser's copy ----------------------------------------------------------------------------------
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
const nk=n=>NEW+':'+uid+':'+n;
const lsJSON=(k,d)=>{try{const v=JSON.parse(lsGet(k));return v==null?d:v}catch(e){return d}};
function cache(){lsSet(nk('habits'),JSON.stringify(S.habits));lsSet(nk('cats'),JSON.stringify(S.cats));lsSet(nk('grps'),JSON.stringify(S.grps));
  lsSet(nk('base'),JSON.stringify([...base]));lsSet(nk('catsbase'),JSON.stringify(catsBase))}
const doneMsg=()=>big?'Saved to cloud · data is getting large, export a backup':'Saved to cloud ✓';
const online=()=>navigator.onLine!==false;

// Called after every change the app makes. Saves on this device at once and to the cloud shortly after.
export function save(){
  big=S.habits.some(h=>JSON.stringify(h).length>SIZE_WARN);
  cache();
  setSync(big?'A habit is getting large. Export a backup.':!online()?'Offline · saved on this device':ready?'Saving…':'Saved on this device · waiting for the cloud');
  clearTimeout(timer);timer=setTimeout(flush,400);
}
// Called when the browser comes back online
export function syncNow(){if(!uid)return;if(!ready&&needMove)moveData();else flush()}

// ---- sending ------------------------------------------------------------------------------------------------
// Everything the cloud has not confirmed yet, as small jobs
function planJobs(){const jobs=[],have=new Set();
  for(const h of S.habits){const d=toHabit(h);if(!d)continue;have.add(d.id);
    const b=base.get(d.id);
    if(!b)jobs.push({type:'create',id:d.id,doc:d});
    else{const ops=diff(b,h,HM);if(ops.length)jobs.push({type:'update',id:d.id,ops})}}
  for(const id of base.keys())if(!have.has(id))jobs.push({type:'delete',id});
  if(catsBase){const ops=diff(catsBase,catsToDoc(S.cats,S.grps),CM);if(ops.length)jobs.push({type:'cats',ops})}
  return jobs}
const toArgs=ops=>ops.flatMap(o=>[new FieldPath(...o.path),o.del?deleteField():o.value]);

function run(j){const ref=j.type==='cats'?catsRef:doc(habitsRef,j.id);
  const p=j.type==='create'?setDoc(ref,j.doc):j.type==='delete'?deleteDoc(ref):updateDoc(ref,...toArgs(j.ops));
  return p.then(()=>{   // confirmed by the cloud: this is now the base
    if(j.type==='create')base.set(j.id,j.doc);
    else if(j.type==='delete')base.delete(j.id);
    else if(j.type==='cats')catsBase=apply(catsBase,j.ops,CM);
    else if(base.has(j.id))base.set(j.id,apply(base.get(j.id),j.ops,HM));
    cache();
  },e=>{
    if(e&&e.code==='not-found'&&j.type==='update'){dropHabit(j.id);return 'gone'}   // deleted on another device
    throw e})}

function flush(){
  clearTimeout(timer);timer=null;clearTimeout(retry);
  if(!uid||!ready)return;
  if(flushing){again=true;return}
  const jobs=planJobs();
  if(!jobs.length){setSync(doneMsg());return}
  flushing=true;again=false;let failed=null,gone=false;
  Promise.all(jobs.map(j=>run(j).then(r=>{if(r==='gone')gone=true},e=>{failed=failed||e}))).then(()=>{
    flushing=false;cache();
    if(gone&&cbs.onRemote)cbs.onRemote();
    if(failed){console.error('Cloud save failed',failed);
      setSync(failed.code==='permission-denied'?'Cloud save blocked · update the Firestore rules (see README)':'Cloud save failed · kept on this device');
      if(failed.code!=='permission-denied')retry=setTimeout(flush,15000);   // try again; nothing is lost meanwhile
      return}
    if(again)flush();else setSync(doneMsg())});
}

// ---- receiving ----------------------------------------------------------------------------------------------
function dropHabit(id){const n=S.habits.length;S.habits=S.habits.filter(h=>h.id!==id);return base.delete(id)||n!==S.habits.length}
// Returns true when what the person sees changed
const eqHabit=(a,b)=>same(toHabit(a)||a,toHabit(b)||b);   // an empty map and a missing map are the same
function mergeHabit(id,R){
  const i=S.habits.findIndex(h=>h.id===id),b=base.get(id);let changed=false;
  if(i>=0){const next=rebase(b,S.habits[i],R,HM);if(!eqHabit(next,S.habits[i])){S.habits[i]=next;changed=true}}
  else if(!b){S.habits.push(clone(R));changed=true}   // created on another device (its own copy: base must never share an object with S)
  // else: deleted here and the cloud has not confirmed it yet: it stays deleted
  base.set(id,R);return changed}

// "Syncing…" turns into "Synced ✓" once the cloud has answered for both the habits and the categories and nothing is waiting to be sent
function settle(){
  if(syncing&&ready&&seenServer&&!flushing&&!timer&&!planJobs().length){syncing=false;setSync(big?'Synced · data is getting large, export a backup':'Synced ✓')}}
// Shared tail of both listeners
function after(changed,fromServer){
  if(changed){sortHabits(S.habits);cache();if(cbs.onRemote)cbs.onRemote()}
  if(!ready)return;
  if(changed&&!flushing&&planJobs().length)flush();                       // unsent local edits go out now
  else if(fromServer&&changed&&!flushing&&!timer&&!syncing)setSync(big?'Synced · data is getting large, export a backup':'Synced ✓');
  settle();
}
function onHabits(snap){
  let changed=false;
  // includeMetadataChanges: our own writes first show up as "pending" (ignored below), then again once the cloud confirms them
  snap.docChanges({includeMetadataChanges:true}).forEach(ch=>{
    const id=ch.doc.id;
    if(ch.doc.metadata.hasPendingWrites)return;                   // an echo of our own unconfirmed write
    // "removed" while we still show it = deleted on another device. If we already deleted it here, it is our own delete (maybe unsent): keep it in base so it gets sent.
    if(ch.type==='removed'){if(S.habits.some(h=>h.id===id))changed=dropHabit(id)||changed;return}
    const R=toHabit(ch.doc.data(),id);
    if(R)changed=mergeHabit(id,R)||changed});
  if(!snap.metadata.fromCache&&!seenServer){seenServer=true;       // first full answer from the cloud: anything we confirmed before but is gone now was deleted elsewhere
    const have=new Set(snap.docs.map(d=>d.id));
    for(const id of [...base.keys()])if(!have.has(id)&&S.habits.some(h=>h.id===id))changed=dropHabit(id)||changed}
  after(changed,!snap.metadata.fromCache);
}
function onCats(snap){
  if(snap.metadata.hasPendingWrites)return;
  if(!snap.exists()){                                              // not moved yet (or brand-new account)
    if(!snap.metadata.fromCache&&!ready){needMove=true;moveData()}
    return}
  const R=normCats(snap.data()),mine=catsToDoc(S.cats,S.grps),pend=catsBase?diff(catsBase,mine,CM):[],merged=apply(R,pend,CM),next=docToCats(merged),nextG=docToGrps(merged,next);
  const changed=!same(next,S.cats)||!same(nextG,S.grps);S.cats=next;S.grps=nextG;catsBase=R;
  const first=!ready;ready=true;needMove=false;
  if(first)recoverOld().finally(()=>{after(changed,true);if(planJobs().length)flush();else settle()});
  else after(changed,!snap.metadata.fromCache);
}

// ---- the one-time move from the old single document ---------------------------------------------------------
// The old document is only READ. The marker (categories document) is written last, so an interrupted move simply runs again.
async function readOld(){
  const snap=await getDocFromServer(doc(db,'users',uid)),key=OLD+':'+uid;
  let habits=[],cats=null,upd=0;
  if(snap.exists()){const d=snap.data();try{habits=JSON.parse(d.data)}catch(e){}cats=d.cats||null;upd=Number(d.updated)||0}
  const dirty=Number(lsGet(key+':dirty'))||0;
  if(dirty>upd||!snap.exists()){       // this browser holds old-format edits the cloud never got: they win, as before
    try{const lh=JSON.parse(lsGet(key));if(Array.isArray(lh)){habits=lh;cats=lsGet(key+':cats')||cats}}catch(e){}}
  return{habits,cats}}
async function moveData(){
  if(migrating||!uid)return;migrating=true;const me=uid;
  setSync('Moving your data to the new format…');
  try{
    if((await getDocFromServer(catsRef)).exists())return;          // another device finished first, the live listener picks it up
    const old=await readOld(),plan=planMigration(old.habits,old.cats);
    if(uid!==me)return;
    for(let i=0;i<plan.habits.length;i+=BATCH){const b=writeBatch(db);plan.habits.slice(i,i+BATCH).forEach(h=>b.set(doc(habitsRef,h.id),h));await b.commit()}
    lsSet(nk('recovered'),'1');                                    // this move already includes this browser's old-format edits; set BEFORE the marker becomes visible
    await runTransaction(db,async tx=>{if((await tx.get(catsRef)).exists())return;
      tx.set(catsRef,{...catsToDoc(plan.cats),schema:2,migratedFrom:'users/'+me,migratedAt:Date.now(),habitCount:plan.habits.length,skipped:plan.skipped})});
    if(plan.skipped)console.warn(plan.skipped+' old habit(s) could not be moved (bad id or name). They are still in the old document.');
  }catch(e){
    try{localStorage.removeItem(nk('recovered'))}catch(x){}
    console.error('Move to per-habit documents failed',e);
    if(e&&e.code==='permission-denied')setSync('Cannot move your data yet · update the Firestore rules (see README). Your old data is untouched.');
    else{setSync('Could not move your data yet · will retry. Your old data is untouched.');setTimeout(()=>{if(uid===me&&!ready)moveData()},15000)}
  }finally{migrating=false}
}
// A device that edited offline in the OLD format and updates only after another device did the move: its unsent edits are
// found by comparing its old local copy with the frozen old cloud document, then laid onto the new data. Runs once per device.
async function recoverOld(){
  const me=uid,key=OLD+':'+uid,flag=nk('recovered');
  if(lsGet(flag))return;
  const dirty=Number(lsGet(key+':dirty'))||0;
  if(!dirty){lsSet(flag,'1');return}
  try{
    const snap=await getDocFromServer(doc(db,'users',uid));if(uid!==me)return;
    const d=snap.exists()?snap.data():{};
    if(dirty>(Number(d.updated)||0)){
      const before=JSON.stringify([S.habits,S.cats]);
      const arr=t=>{try{const a=JSON.parse(t);return Array.isArray(a)?a:[]}catch(e){return[]}};
      const byId=a=>new Map(a.map(h=>toHabit(h)).filter(Boolean).map(h=>[h.id,h]));
      const B=byId(arr(d.data)),L=byId(arr(lsGet(key)));
      for(const [id,h] of L){const b=B.get(id),i=S.habits.findIndex(x=>x.id===id);
        if(!b){if(i<0)S.habits.push(h)}
        else if(i>=0){const ops=diff(b,h,HM);if(ops.length)S.habits[i]=apply(S.habits[i],ops,HM)}}
      for(const id of B.keys())if(!L.has(id))S.habits=S.habits.filter(x=>x.id!==id);
      const co=diff(catsToDoc(loadCats(d.cats)),catsToDoc(loadCats(lsGet(key+':cats'))),CM);
      if(co.length)S.cats=docToCats(apply(catsToDoc(S.cats),co,CM));
      sortHabits(S.habits);
      if(JSON.stringify([S.habits,S.cats])!==before){save();if(cbs.onRemote)cbs.onRemote()}}
    lsSet(flag,'1');
  }catch(e){/* offline: try again next start */}
}

// ---- sign-in state ------------------------------------------------------------------------------------------
// onOut(): signed out. onIn(user): signed in, this browser's copy is already in S. onRemote(): S changed because of the cloud.
export function watchAuth({onOut,onIn,onRemote}){
  cbs={onRemote};
  onAuthStateChanged(auth,u=>{
    unsubs.forEach(f=>f());unsubs=[];clearTimeout(timer);clearTimeout(retry);timer=retry=null;
    uid=null;habitsRef=catsRef=null;base=new Map();catsBase=null;ready=flushing=again=migrating=needMove=seenServer=big=false;syncing=true;
    if(!u){resetState();onOut();return}
    uid=u.uid;habitsRef=collection(db,'users',uid,'habits');catsRef=doc(db,'users',uid,'meta','categories');
    // This browser's copy. If its "confirmed" half is missing or damaged, trust the cloud instead of risking an overwrite.
    const lh=lsJSON(nk('habits'),[]),lb=lsJSON(nk('base'),null);
    if(Array.isArray(lh)&&Array.isArray(lb)&&lb.every(p=>Array.isArray(p)&&typeof p[0]==='string')){
      S.habits=sortHabits(lh.map(h=>toHabit(h)).filter(Boolean));base=new Map(lb);catsBase=lsJSON(nk('catsbase'),null);S.cats=loadCats(lsGet(nk('cats')));S.grps=loadGrps(lsGet(nk('grps')),S.cats);
      if(lsGet(nk('grps'))===null&&catsBase&&catsBase.grps&&Object.keys(catsBase.grps).length)catsBase=null}   // groups known to the cloud but missing here: trust the cloud, never delete them
    else{S.habits=[];S.cats=loadCats(null);S.grps=[]}
    onIn(u);
    setSync(online()?'Syncing…':'Offline · showing the copy saved on this device');
    const fail=e=>{console.error('Cloud sync failed',e);
      setSync(e&&e.code==='permission-denied'?'Cloud sync blocked · update the Firestore rules (see README)':'Cloud sync problem · kept on this device')};
    unsubs=[onSnapshot(catsRef,{includeMetadataChanges:true},onCats,fail),onSnapshot(habitsRef,{includeMetadataChanges:true},onHabits,fail)];
  });
}
