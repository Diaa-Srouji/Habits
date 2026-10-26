// Runs the REAL src/sync.js on several simulated devices against an in-memory stand-in for Firestore.
//   node tools/sync-sim/run.mjs
// The stand-in imitates what matters here: writes show up first as "pending" echoes and are confirmed later, offline devices queue
// writes, map fields come back in alphabetical order, undefined is refused, and the rules in firestore.rules are enforced.
// No dependencies; needs Node 18+.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';

const SRC=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..','src');
const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'habit-sim-'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const J=v=>JSON.parse(JSON.stringify(v));
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sorted=v=>Array.isArray(v)?v.map(sorted):isObj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const hasUndef=v=>v===undefined||(v&&typeof v==='object'&&Object.values(v).some(hasUndef));

// ---------------------------------------------------------------- fake Firestore (shared by all devices) ---
const FS=globalThis.__FS={
  docs:new Map(),clients:[],ackFirst:false,
  reset(){this.docs=new Map();this.clients=[];this.ackFirst=false},
  newClient(){const c={online:true,frozen:new Map(),pending:[],listeners:new Set(),sending:false};this.clients.push(c);return c},
  base(c){return c.online?this.docs:c.frozen},
  view(c){const m=new Map([...this.base(c)].map(([k,v])=>[k,{data:J(v),pending:false}]));
    for(const mu of c.pending){try{this.applyMut(m,mu)}catch(e){}}return m},
  applyMut(m,mu){
    if(mu.kind==='del')m.delete(mu.path);
    else if(mu.kind==='set')m.set(mu.path,{data:J(mu.data),pending:true});
    else{const o=m.get(mu.path);if(!o)throw {code:'not-found'};m.set(mu.path,{data:applyUpdate(o.data,mu.args),pending:true})}},
  rules(p,nd,kind){
    const s=p.split('/'),deny=()=>{throw {code:'permission-denied'}};
    if(s[0]!=='users')deny();
    if(s.length===2)deny();                                    // the old single document: read-only
    if(s.length===4&&s[2]==='habits'){if(kind==='del')return;if(!(nd.id===s[3]&&typeof nd.name==='string'&&isObj(nd.done)))deny();return}
    if(s.length===4&&s[2]==='meta'){if(kind==='del')deny();if(!isObj(nd.cats))deny();return}
    deny()},
  commit(mu){const old=this.docs.get(mu.path);
    if(mu.kind==='del'){this.rules(mu.path,null,'del');this.docs.delete(mu.path);return}
    let nd;if(mu.kind==='set')nd=J(mu.data);else{if(!old)throw {code:'not-found'};nd=applyUpdate(J(old),mu.args)}
    this.rules(mu.path,nd,mu.kind);this.docs.set(mu.path,nd)},
  submit(c,mu){
    if(mu.kind!=='del'&&mu.kind!=='update'&&hasUndef(mu.data))throw new Error('Unsupported field value: undefined');
    if(mu.kind==='update'&&hasUndef(mu.args.filter((x,i)=>i%2===1&&x!==DEL)))throw new Error('Unsupported field value: undefined');
    return new Promise((resolve,reject)=>{mu.resolve=resolve;mu.reject=reject;c.pending.push(mu);this.notify(c);this.drain(c)})},
  async drain(c){if(c.sending)return;c.sending=true;
    while(c.online&&c.pending.length){await sleep(3);const mu=c.pending[0];
      try{this.commit(mu);c.pending.shift();
        if(this.ackFirst){mu.resolve();await sleep(1);this.notifyAll()}else{this.notifyAll();mu.resolve()}}
      catch(e){c.pending.shift();mu.reject(e);this.notifyAll()}}
    c.sending=false},
  setOnline(c,on){if(on===c.online)return;
    if(!on){c.frozen=new Map([...this.docs].map(([k,v])=>[k,J(v)]));c.online=false;this.notify(c)}
    else{c.online=true;this.notifyAll();this.drain(c)}},
  notifyAll(){this.clients.forEach(c=>this.notify(c))},
  notify(c){for(const l of [...c.listeners])this.emit(c,l)},
  snapDoc(c,l){const v=this.view(c).get(l.ref.path);
    return {id:l.ref.id,exists:()=>!!v,data:()=>v&&sorted(v.data),metadata:{fromCache:!c.online,hasPendingWrites:!!(v&&v.pending)}}},
  snapCol(c,l){const pre=l.ref.path+'/',v=this.view(c),cur=new Map();
    for(const [p,x] of v)if(p.startsWith(pre)&&!p.slice(pre.length).includes('/'))cur.set(p.slice(pre.length),x);
    const last=l.last||new Map(),changes=[];
    for(const [id,x] of cur){const o=last.get(id);
      if(!o)changes.push({type:'added',id,x});
      else if(JSON.stringify(sorted(o.data))!==JSON.stringify(sorted(x.data))||o.pending!==x.pending)changes.push({type:'modified',id,x})}
    for(const [id,o] of last)if(!cur.has(id))changes.push({type:'removed',id,x:o});
    const mk=(id,x)=>({id,data:()=>sorted(x.data),metadata:{hasPendingWrites:x.pending}});
    return {cur,snap:{metadata:{fromCache:!c.online,hasPendingWrites:[...cur.values()].some(x=>x.pending)},
      docs:[...cur].sort((a,b)=>a[0]<b[0]?-1:1).map(([id,x])=>mk(id,x)),
      docChanges:()=>changes.map(ch=>({type:ch.type,doc:mk(ch.id,ch.x)}))},changed:changes.length>0}},
  emit(c,l){if(l.dead)return;
    if(l.ref.kind==='doc'){const s=this.snapDoc(c,l),key=JSON.stringify([s.exists(),s.data(),s.metadata]);
      if(key!==l.key){l.key=key;l.next(s)}}
    else{const {cur,snap,changed}=this.snapCol(c,l),key=JSON.stringify([snap.metadata]);
      if(changed||key!==l.key||!l.started){l.started=true;l.key=key;l.last=cur;l.next(snap)}}},
  listen(ref,next){const c=ref.client,l={ref,next,key:null,last:null,started:false,dead:false};c.listeners.add(l);
    setTimeout(()=>this.emit(c,l),2);return ()=>{l.dead=true;c.listeners.delete(l)}},
};
globalThis.__DEVS={};
const DEL=globalThis.__DEL={__delete:true};
function applyUpdate(d,args){for(let i=0;i<args.length;i+=2){const segs=args[i].segs||String(args[i]).split('.'),v=args[i+1];
    let o=d;for(const s of segs.slice(0,-1)){if(!isObj(o[s]))o[s]={};o=o[s]}
    const last=segs[segs.length-1];if(v===DEL)delete o[last];else o[last]=J(v)}
  return d}

// ---------------------------------------------------------------- device = a copy of src/ + stubs --------
function stubs(dir,id){
  const nm=path.join(dir,'node_modules','firebase');fs.mkdirSync(nm,{recursive:true});
  fs.writeFileSync(path.join(nm,'package.json'),JSON.stringify({name:'firebase',type:'module',exports:{'./app':'./app.js','./auth':'./auth.js','./firestore':'./firestore.js'}}));
  fs.writeFileSync(path.join(nm,'app.js'),'export const initializeApp=()=>({});');
  fs.writeFileSync(path.join(nm,'auth.js'),`const D=()=>globalThis.__DEVS[${JSON.stringify(id)}];
export const getAuth=()=>({});
export const onAuthStateChanged=(a,cb)=>{D().authCb=cb;return()=>{}};
export const signInWithEmailAndPassword=async()=>{},createUserWithEmailAndPassword=async()=>{},signOut=async()=>{},sendPasswordResetEmail=async()=>{};`);
  fs.writeFileSync(path.join(nm,'firestore.js'),`const FS=globalThis.__FS;
export class FieldPath{constructor(...s){this.segs=s}}
const DEL=globalThis.__DEL;export const deleteField=()=>DEL;
export const getFirestore=()=>FS.newClient();
const mk=(kind,b,segs)=>({kind,client:b.client||b,path:[...(b.path?[b.path]:[]),...segs].join('/'),id:segs[segs.length-1]});
export const collection=(b,...s)=>mk('col',b,s);
export const doc=(b,...s)=>mk('doc',b,s);
const mut=(kind,ref,x)=>{try{return FS.submit(ref.client,{kind,path:ref.path,...x})}catch(e){throw e}};
export const setDoc=(ref,data)=>mut('set',ref,{data});
export const updateDoc=(ref,...args)=>mut('update',ref,{args});
export const deleteDoc=ref=>mut('del',ref,{});
const snapOf=(c,ref)=>{const v=FS.docs.get(ref.path);return {id:ref.id,exists:()=>!!v,data:()=>v&&JSON.parse(JSON.stringify(v)),metadata:{fromCache:false}}};
export const getDocFromServer=async ref=>{await new Promise(r=>setTimeout(r,3));if(!ref.client.online)throw {code:'unavailable'};return snapOf(ref.client,ref)};
export const onSnapshot=(ref,...a)=>{const next=a.find(x=>typeof x==='function');return FS.listen(ref,next)};
export const writeBatch=db=>{const ops=[];return {set:(ref,data)=>ops.push(['set',ref,data]),commit:()=>Promise.all(ops.map(([k,r,d])=>mut(k,r,{data:d})))}};
export const runTransaction=async(db,fn)=>{await new Promise(r=>setTimeout(r,3));if(!db.online)throw {code:'unavailable'};
  const ops=[],tx={get:async ref=>snapOf(db,ref),set:(ref,data)=>ops.push([ref,data])};await fn(tx);
  for(const [ref,data] of ops){FS.rules(ref.path,JSON.parse(JSON.stringify(data)),'set');FS.docs.set(ref.path,JSON.parse(JSON.stringify(data)))}FS.notifyAll()};`);
}
let seq=0;
async function device(name){
  const id=name+'_'+(++seq),dir=path.join(TMP,id);fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');stubs(dir,id);
  for(const f of fs.readdirSync(SRC))if(f.endsWith('.js')&&f!=='firebase-config.example.js'){
    let t=fs.readFileSync(path.join(SRC,f),'utf8');
    if(f==='sync.js')t=`const localStorage=globalThis.__DEVS[${JSON.stringify(id)}].ls,document=globalThis.__DEVS[${JSON.stringify(id)}].doc,navigator=globalThis.__DEVS[${JSON.stringify(id)}].nav;\n`+t;
    fs.writeFileSync(path.join(dir,'src',f),t)}
  fs.writeFileSync(path.join(dir,'src','firebase-config.js'),'export const firebaseConfig={};');
  const store=new Map(),statusEl={textContent:''},history=[];
  const d=globalThis.__DEVS[id]={nav:{onLine:true},statusEl,
    ls:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>{store.set(k,String(v))},removeItem:k=>{store.delete(k)}},
    doc:{getElementById:i=>i==='sync'?new Proxy(statusEl,{set(o,k,v){if(k==='textContent'){o[k]=v;history.push(v)}return true}}):null}};
  const u=p=>pathToFileURL(path.join(dir,'src',p)).href;
  const sync=await import(u('sync.js')),{S}=await import(u('state.js')),sc=await import(u('scoring.js'));
  const dev={name,S,sync,sc,store,history,remoteRenders:0,
    get status(){return statusEl.textContent},
    client:()=>FS.clients.find((_,i)=>true)&&dev._client,
    login(uid){dev.remoteRenders=0;sync.watchAuth({onOut(){},onIn(){},onRemote(){dev.remoteRenders++}});return d.authCb({uid,email:uid+'@x'})},
    // like closing and reopening the app: the SDK's unsent queue is gone, the browser's localStorage stays
    reopen(uid){dev._client.pending.length=0;d.authCb(null);d.authCb({uid,email:uid+'@x'})},
    offline(){d.nav.onLine=false;FS.setOnline(dev._client,false)},
    online(){d.nav.onLine=true;FS.setOnline(dev._client,true);sync.syncNow()},
    edit(fn){fn(S);sync.save()}};
  // the client is created by sync.js at import time: it is the newest one
  dev._client=FS.clients[FS.clients.length-1];
  return dev}

// ---------------------------------------------------------------- helpers + scenarios ------------------------
const UID='u1',DAY=['2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06'];
const OLD_HABITS=()=>[
  {id:'hk1a',name:'Read',cat:'school',type:'pages',stop:false,goal:10,unit:'pages',created:'2026-10-01',done:{[DAY[0]]:12,[DAY[1]]:8},skip:{},notes:{[DAY[0]]:'good one'}},
  {id:'hk1b',name:'Phone',cat:'deen',type:'min',stop:true,goal:60,unit:'min',created:'2026-10-01',done:{[DAY[1]]:30},skip:{[DAY[2]]:1},notes:{},off:{[DAY[3]]:'sick'}},
  {id:'hk1c',name:'Old one',cat:'olympiad',type:'bool',stop:false,goal:1,unit:'',created:'2026-09-20',done:{'2026-09-20':1},desc:'legacy',archived:true},
  {id:'bad id/1',name:'cannot be a document id'}];
const OLD_CATS=()=>[{id:'school',name:'School',color:'#2F7BEA',icon:'📚',order:0},{id:'deen',name:'Deen',color:'#1A9850',icon:'🕌',order:1},{id:'olympiad',name:'Olympiad',color:'#E8772B',icon:'🏆',order:2}];
function seedOld(upd=1000){FS.docs.set('users/'+UID,{data:JSON.stringify(OLD_HABITS()),cats:JSON.stringify(OLD_CATS()),updated:upd})}
const oldBytes=()=>JSON.stringify(FS.docs.get('users/'+UID));
const hdoc=id=>FS.docs.get(`users/${UID}/habits/${id}`);
const habitDocs=()=>[...FS.docs.keys()].filter(k=>k.startsWith(`users/${UID}/habits/`)).map(k=>k.split('/').pop()).sort();
const hOf=(dev,id)=>dev.S.habits.find(h=>h.id===id);
const settle=(ms=900)=>sleep(ms);
async function until(fn,what,ms=4000){const t=Date.now();while(Date.now()-t<ms){if(fn())return;await sleep(20)}assert.fail('timed out waiting for: '+what)}
let passed=0;const ok=n=>{passed++;console.log('  ✓ '+n)};

async function scenario(title,fn){console.log('\n'+title);FS.reset();await fn()}

await scenario('1. First run moves the old document into per-habit documents',async()=>{
  seedOld();const before=oldBytes(),A=await device('A');A.login(UID);
  await until(()=>FS.docs.has(`users/${UID}/meta/categories`)&&A.status.startsWith('Synced'),'move + Synced ✓');
  assert.deepEqual(habitDocs(),['hk1a','hk1b','hk1c']);ok('3 usable habits became 3 documents (the one with an impossible id stays only in the backup)');
  const m=FS.docs.get(`users/${UID}/meta/categories`);assert.equal(m.schema,2);assert.equal(m.skipped,1);assert.equal(Object.keys(m.cats).length,3);ok('categories document written last, with the "moved" marker');
  const orig=OLD_HABITS();
  for(const o of orig.slice(0,3)){const d=hdoc(o.id);for(const k of Object.keys(o)){assert.deepEqual(d[k],o[k],o.id+'.'+k)}}ok('every field of every moved habit is identical to the old data');
  assert.equal(oldBytes(),before);ok('old document is byte-for-byte unchanged');
  assert.deepEqual(A.S.habits.map(h=>h.id),['hk1a','hk1b','hk1c']);assert.equal(A.S.cats.length,3);ok('the app shows all moved habits and categories');
  assert.equal(A.status,'Synced ✓');ok('status line ends at "Synced ✓"')});

await scenario('2. Two devices edit at the same time (same habit, different days; different habits; categories)',async()=>{
  seedOld();const A=await device('A'),B=await device('B');A.login(UID);await until(()=>A.status==='Synced ✓','A synced');B.login(UID);await until(()=>B.S.habits.length===3&&B.status==='Synced ✓','B synced');
  A.remoteRenders=B.remoteRenders=0;
  A.edit(S=>{A.sc.setAmt(hOf(A,'hk1a'),DAY[2],20);hOf(A,'hk1b').name='Phone (A)'; S.cats.find(c=>c.id==='school').name='School A'});
  B.edit(S=>{B.sc.setAmt(hOf(B,'hk1a'),DAY[3],15);hOf(B,'hk1a').notes[DAY[3]]='from B';hOf(B,'hk1c').goal=2;S.cats.push({id:'cnew',name:'New B',color:'#B83DBA',icon:'',order:3})});
  await settle();
  const d=hdoc('hk1a');assert.equal(d.done[DAY[2]],20);assert.equal(d.done[DAY[3]],15);assert.equal(d.done[DAY[0]],12);assert.equal(d.notes[DAY[3]],'from B');ok('same habit, different days: both edits are in the cloud');
  assert.equal(hdoc('hk1b').name,'Phone (A)');assert.equal(hdoc('hk1c').goal,2);ok('different habits: both edits are in the cloud');
  const cats=FS.docs.get(`users/${UID}/meta/categories`).cats;assert.equal(cats.school.name,'School A');assert.ok(cats.cnew);ok('categories: rename on A and new category on B both survive');
  for(const X of [A,B]){assert.equal(hOf(X,'hk1a').done[DAY[2]],20);assert.equal(hOf(X,'hk1a').done[DAY[3]],15);assert.equal(hOf(X,'hk1b').name,'Phone (A)');assert.equal(hOf(X,'hk1c').goal,2);
    assert.ok(X.S.cats.find(c=>c.id==='cnew'));assert.equal(X.S.cats.find(c=>c.id==='school').name,'School A')}ok('both devices end up showing exactly the same merged data');
  // removing a day on one device and editing another day on the other
  A.edit(()=>{A.sc.setAmt(hOf(A,'hk1a'),DAY[0],null)});B.edit(()=>{A.sc.setAmt(hOf(B,'hk1a'),DAY[4],7)});await settle();
  assert.equal(hdoc('hk1a').done[DAY[0]],undefined);assert.equal(hdoc('hk1a').done[DAY[4]],7);ok('un-logging a day on one device and logging another day on the other both stick');
  assert.equal(oldBytes(),JSON.stringify({data:JSON.stringify(OLD_HABITS()),cats:JSON.stringify(OLD_CATS()),updated:1000}));ok('old document still untouched');
  const a0=A.remoteRenders,b0=B.remoteRenders;A.edit(()=>{hOf(A,'hk1a').goal=11});A.edit(()=>{hOf(A,'hk1a').goal=12});await settle();
  assert.equal(A.remoteRenders,a0);assert.equal(hdoc('hk1a').goal,12);ok('a device does not redraw the page because of the echo of its own saves (no lost focus while typing)')});

await scenario('3. Offline edits survive a reload and merge when the connection returns',async()=>{
  seedOld();const A=await device('A'),B=await device('B');A.login(UID);await until(()=>A.status==='Synced ✓','A');B.login(UID);await until(()=>B.S.habits.length===3&&B.status==='Synced ✓','B');
  B.offline();
  B.edit(S=>{B.sc.setAmt(hOf(B,'hk1a'),DAY[2],33);S.habits.push({id:'hknew1',name:'Made offline',cat:'school',type:'min',stop:false,goal:30,unit:'min',created:DAY[2],done:{},skip:{},notes:{}});S.habits=S.habits.filter(h=>h.id!=='hk1c')});
  assert.match(B.status,/^Offline/);ok('status line says "Offline · saved on this device"');
  A.edit(()=>{A.sc.setAmt(hOf(A,'hk1a'),DAY[3],44);hOf(A,'hk1c').goal=9});await settle();
  assert.equal(hdoc('hk1a').done[DAY[2]],undefined);ok('nothing from the offline device has reached the cloud yet');
  B.reopen(UID);await settle();   // app closed and reopened while still offline
  assert.equal(hOf(B,'hk1a').done[DAY[2]],33);assert.ok(hOf(B,'hknew1'));assert.ok(!hOf(B,'hk1c'));ok('after a reload the offline edits are still there');
  B.online();await until(()=>B.status==='Saved to cloud ✓'||B.status==='Synced ✓','B saved');await settle();
  const d=hdoc('hk1a');assert.equal(d.done[DAY[2]],33);assert.equal(d.done[DAY[3]],44);ok('offline edit and A\'s edit to the same habit are both in the cloud');
  assert.ok(hdoc('hknew1'));assert.equal(hdoc('hk1c'),undefined);ok('habit created offline exists, habit deleted offline is gone');
  assert.ok(!hOf(A,'hk1c'));assert.ok(hOf(A,'hknew1'));assert.equal(hOf(A,'hk1a').done[DAY[2]],33);ok('device A picked everything up');
  assert.equal(JSON.parse(FS.docs.get('users/'+UID).data).length,4);ok('old document untouched')});

await scenario('4. Cloud confirms before / after the save promise (both orders)',async()=>{
  for(const ackFirst of [true,false]){FS.reset();FS.ackFirst=ackFirst;seedOld();const A=await device('A');A.login(UID);await until(()=>A.status==='Synced ✓','synced');
    A.edit(()=>{A.sc.setAmt(hOf(A,'hk1a'),DAY[5],5);A.sc.setAmt(hOf(A,'hk1a'),DAY[4],6)});await until(()=>A.status==='Saved to cloud ✓','saved');
    assert.equal(hdoc('hk1a').done[DAY[5]],5);A.reopen(UID);await settle();
    assert.equal(hOf(A,'hk1a').done[DAY[4]],6)}
  ok('works whichever arrives first, the write confirmation or the live update')});

await scenario('5. Edits made in the OLD version while offline are not lost',async()=>{
  seedOld(1000);
  // device A moves the data first
  const A=await device('A');A.login(UID);await until(()=>A.status==='Synced ✓','A moved');
  A.edit(()=>{hOf(A,'hk1b').name='Phone (new version)'});await settle();
  // device C has old-version edits made offline: its dirty stamp is newer than the old cloud copy
  const C=await device('C'),key='habit-tracker-v2:'+UID,mine=OLD_HABITS();
  mine[0].done[DAY[5]]=99;mine[2].goal=3;mine.push({id:'hkoffline',name:'Added offline in old version',cat:'school',type:'min',stop:false,goal:30,unit:'min',created:DAY[5],done:{},skip:{},notes:{}});
  C.store.set(key,JSON.stringify(mine));C.store.set(key+':dirty','2000');C.store.set(key+':cats',JSON.stringify(OLD_CATS()));
  C.login(UID);await until(()=>C.status==='Synced ✓'||C.status==='Saved to cloud ✓','C synced');await settle();
  assert.equal(hdoc('hk1a').done[DAY[5]],99);assert.equal(hdoc('hk1c').goal,3);assert.ok(hdoc('hkoffline'));ok('old-version offline edits were merged in');
  assert.equal(hdoc('hk1b').name,'Phone (new version)');ok('and they did not overwrite what A changed in the meantime');
  assert.equal(C.store.get('habit-tracker-v3:'+UID+':recovered'),'1');ok('recovery runs only once per device')});

await scenario('6. A device with old-version edits does the move itself: its edits win (same rule as before)',async()=>{
  seedOld(1000);const C=await device('C'),key='habit-tracker-v2:'+UID,mine=OLD_HABITS();mine[0].done[DAY[5]]=77;
  C.store.set(key,JSON.stringify(mine));C.store.set(key+':dirty','5000');C.store.set(key+':cats',JSON.stringify(OLD_CATS()));
  C.login(UID);await until(()=>C.status==='Synced ✓','synced');
  assert.equal(hdoc('hk1a').done[DAY[5]],77);ok('moved data includes the unsynced old-version edit');
  assert.equal(JSON.parse(FS.docs.get('users/'+UID).data)[0].done[DAY[5]],undefined);ok('old cloud document still has its original content')});

await scenario('7. Brand-new account, nothing to move',async()=>{
  const A=await device('A');A.login('fresh');await until(()=>A.status==='Synced ✓','synced');
  assert.ok(FS.docs.has('users/fresh/meta/categories'));assert.equal(A.S.cats.length,3);
  A.edit(S=>{S.habits.push({id:'hnew',name:'First',cat:'school',type:'min',stop:false,goal:30,unit:'min',created:DAY[0],done:{},skip:{},notes:{}})});await settle();
  assert.ok(FS.docs.get('users/fresh/habits/hnew'));ok('first habit is saved as its own document')});

await scenario('8. Rules not published yet / network trouble show a clear message and lose nothing',async()=>{
  seedOld();const A=await device('A');A.login(UID);await until(()=>A.status==='Synced ✓','synced');
  const orig=FS.commit.bind(FS);FS.commit=()=>{throw {code:'permission-denied'}};
  A.edit(()=>{hOf(A,'hk1a').goal=50});await settle();assert.match(A.status,/Firestore rules/);ok('permission problem is explained in the status line');
  FS.commit=orig;assert.equal(hOf(A,'hk1a').goal,50);ok('the edit is still on the device');
  A.edit(()=>{hOf(A,'hk1a').goal=51});await settle();assert.equal(hdoc('hk1a').goal,51);ok('and goes out with the next save once the rules are fixed')});

console.log('\nAll '+passed+' checks passed.');
fs.rmSync(TMP,{recursive:true,force:true});
process.exit(0);
