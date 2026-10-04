import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,doc,setDoc,onSnapshot} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";
const KEY='habit-tracker-v2',W=20;
const fbApp=initializeApp(firebaseConfig),auth=getAuth(fbApp),db=getFirestore(fbApp);
let S={habits:[],sel:'all'},ref=null,unsub=null,timer=null;
const cacheKey=()=>KEY+':'+auth.currentUser.uid;
// Saves to this browser at once and to the cloud shortly after, so every device sees the same data.
function save(){
  try{localStorage.setItem(cacheKey(),JSON.stringify(S.habits))}catch(e){}
  clearTimeout(timer);
  timer=setTimeout(()=>{if(ref)setDoc(ref,{data:JSON.stringify(S.habits),updated:Date.now()}).catch(e=>console.error('Cloud save failed',e))},400);
}
const p2=n=>String(n).padStart(2,'0');
const K=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
const add=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const T=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const mondayOf=d=>add(d,-((d.getDay()+6)%7));
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $=id=>document.getElementById(id);

function streak(h){let d=T();if(!h.done[K(d)])d=add(d,-1);let n=0;while(h.done[K(d)]){n++;d=add(d,-1)}return n}
function best(h){const ks=Object.keys(h.done).sort();let b=0,run=0,prev=null;
  for(const k of ks){const [y,m,d]=k.split('-').map(Number);const dt=new Date(y,m-1,d);
    run=prev&&K(add(prev,1))===k?run+1:1;prev=dt;if(run>b)b=run}return b}
function count(h,from,to){let n=0;for(let d=from;d<=to;d=add(d,1))if(h.done[K(d)])n++;return n}
function periods(){const t=T();const wk=mondayOf(t);const mo=new Date(t.getFullYear(),t.getMonth(),1);
  return{t,wk,mo,wkDays:Math.round((t-wk)/864e5)+1,moDays:t.getDate(),moTotal:new Date(t.getFullYear(),t.getMonth()+1,0).getDate()}}
const pct=(a,b)=>b?Math.round(a/b*100):0;

function render(){
  const P=periods(),H=S.habits,n=H.length;
  const O=H.find(h=>h.id===S.open);if(!O)S.open=null;else S.sel=O.id;
  ['add','sumsec','listsec'].forEach(i=>$(i).hidden=!!O);$('detail').hidden=!O;$('chips').hidden=!!O;
  $('date').textContent=P.t.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const td=H.filter(h=>h.done[K(P.t)]).length;
  const wkDone=H.reduce((a,h)=>a+count(h,P.wk,P.t),0),moDone=H.reduce((a,h)=>a+count(h,P.mo,P.t),0);
  const stats=[['Today',pct(td,n),td+' of '+n+' habits'],['This week',pct(wkDone,n*P.wkDays),wkDone+' of '+n*P.wkDays+' check-ins'],['This month',pct(moDone,n*P.moDays),moDone+' of '+n*P.moDays+' check-ins']];
  $('sum').innerHTML=stats.map(s=>`<div><span>${s[0]}</span><b>${s[1]}%</b><span>${n?s[2]:'No habits yet'}</span><div class="bar"><i style="width:${s[1]}%"></i></div></div>`).join('');

  $('chips').innerHTML=`<button class="chip" data-sel="all" aria-pressed="${S.sel==='all'}">All habits</button>`+H.map(h=>`<button class="chip" data-sel="${h.id}" aria-pressed="${S.sel===h.id}">${esc(h.name)}</button>`).join('');
  const one=H.find(h=>h.id===S.sel);if(!one)S.sel='all';
  const start=add(mondayOf(P.t),-(W-1)*7);let cells='';
  for(let i=0;i<W*7;i++){const d=add(start,i),k=K(d);
    if(d>P.t){cells+='<div class="fut"></div>';continue}
    const c=one?(one.done[k]?1:0):H.filter(h=>h.done[k]).length;
    const lv=one?(c?4:0):(c?Math.min(4,Math.ceil(c/n*4)):0);
    const label=d.toLocaleDateString(undefined,{day:'numeric',month:'short'})+': '+(one?(c?'done':'not done'):c+' of '+n+' done');
    cells+=`<button class="l${lv}${one?' edit':''}${k===K(P.t)?' now':''}${O&&k===S.day?' sel':''}${one&&one.notes&&one.notes[k]?' hn':''}" ${one?`data-day="${k}"`:'tabindex="-1"'} title="${label}" aria-label="${label}"></button>`}
  $('heat').innerHTML=cells;
  $('legend').innerHTML='Less '+[0,1,2,3,4].map(i=>`<i style="background:var(--l${i})"></i>`).join('')+' More'+(O?' · Click a day to open its note':one?'':' · Select a habit to fill in past days');

  $('list').innerHTML=n?H.map(h=>{const w=count(h,P.wk,P.t),m=count(h,P.mo,P.t);
    return `<div class="habit"><button class="check" data-tog="${h.id}" aria-pressed="${!!h.done[K(P.t)]}" aria-label="Mark ${esc(h.name)} done today">${h.done[K(P.t)]?'✓':''}</button>
    <div><button class="name nm" data-open="${h.id}">${esc(h.name)}</button>${h.desc?`<div class="desc">${esc(h.desc)}</div>`:''}<div class="meta"><span>Streak <b>${streak(h)}</b> days</span><span>Best <b>${best(h)}</b></span><button class="rm" data-rm="${h.id}">Remove</button></div></div>
    <div class="bars"><div>Week: ${w} of ${P.wkDays} days<div class="bar"><i style="width:${pct(w,P.wkDays)}%"></i></div></div><div>Month: ${m} of ${P.moTotal} days<div class="bar"><i style="width:${pct(m,P.moTotal)}%"></i></div></div></div></div>`}).join('')
    :'<p class="empty">Add your first habit above. Name it by the action, like “Walk 30 minutes”.</p>';
}
const fmt=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})};
function renderNotes(h){const ks=Object.keys(h.notes||{}).filter(k=>h.notes[k]).sort().reverse();
  $('notelist').innerHTML=ks.length?ks.map(k=>`<button class="nt" data-day="${k}"><b>${fmt(k)}</b><span>${esc(h.notes[k])}</span></button>`).join(''):'<p class="empty">No notes yet. Pick a day and write one.</p>'}
function renderDetail(h){const k=S.day||K(T());S.day=k;
  $('detail').innerHTML=`<button class="rm" data-back="1">← All habits</button>
  <h2 class="dname">${esc(h.name)}</h2>
  <div class="meta"><span>Streak <b>${streak(h)}</b> days</span><span>Best <b>${best(h)}</b></span><span>Done <b>${Object.keys(h.done).length}</b> days in total</span></div>
  <label for="desc" style="margin-top:14px">Goal (optional)</label>
  <textarea id="desc" rows="2" placeholder="What are you aiming for, and why?">${esc(h.desc||'')}</textarea>
  <label for="dayPick">Day</label>
  <div class="dayrow"><input type="date" id="dayPick" value="${k}" max="${K(T())}"><label class="ck"><input type="checkbox" id="dayDone" ${h.done[k]?'checked':''}> Done this day</label></div>
  <textarea id="note" rows="4" aria-label="Note for ${fmt(k)}" placeholder="Note for ${fmt(k)} (optional)">${esc((h.notes||{})[k]||'')}</textarea>
  <h2>All notes</h2><div id="notelist"></div>`;
  renderNotes(h)}
const _r=render;render=()=>{_r();const O=S.habits.find(h=>h.id===S.open);if(O)renderDetail(O)};
const flip=(h,k)=>{h.done[k]?delete h.done[k]:h.done[k]=1};
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.sel){S.sel=t.dataset.sel}
  else if(t.dataset.tog){flip(S.habits.find(h=>h.id===t.dataset.tog),K(T()))}
  else if(t.dataset.day){if(S.open)S.day=t.dataset.day;else flip(S.habits.find(h=>h.id===S.sel),t.dataset.day)}
  else if(t.dataset.open){S.open=t.dataset.open;S.day=K(T());window.scrollTo(0,0)}
  else if(t.dataset.back){S.open=null;S.sel='all'}
  else if(t.dataset.rm){S.habits=S.habits.filter(h=>h.id!==t.dataset.rm);if(S.sel===t.dataset.rm)S.sel='all'}
  else return;
  save();render()});
$('add').addEventListener('submit',e=>{e.preventDefault();const v=$('name').value.trim();if(!v)return;
  S.habits.push({id:'h'+Date.now().toString(36),name:v,done:{}});$('name').value='';save();render()});
document.addEventListener('input',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;
  if(e.target.id==='desc'){h.desc=e.target.value}
  else if(e.target.id==='note'){h.notes=h.notes||{};const v=e.target.value;if(v.trim())h.notes[S.day]=v;else delete h.notes[S.day]}
  else return;save()});
document.addEventListener('change',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;const id=e.target.id;
  if(id==='dayPick'&&e.target.value){S.day=e.target.value;render()}
  else if(id==='dayDone'){flip(h,S.day);save();render()}
  else if(id==='note')renderNotes(h)});
const msg=t=>{$('msg').textContent=t};
const authErr=e=>msg(({'auth/invalid-credential':'Wrong email or password.','auth/email-already-in-use':'That email already has an account. Sign in instead.','auth/weak-password':'Use a password with at least 6 characters.','auth/invalid-email':'Enter a valid email address.','auth/operation-not-allowed':'Email sign-in is not enabled in Firebase yet.'})[e.code]||'Could not sign in ('+e.code+').');
$('login').addEventListener('submit',e=>{e.preventDefault();msg('');signInWithEmailAndPassword(auth,$('email').value,$('pass').value).catch(authErr)});
$('signup').addEventListener('click',()=>{msg('');if(!$('login').reportValidity())return;createUserWithEmailAndPassword(auth,$('email').value,$('pass').value).catch(authErr)});
$('out').addEventListener('click',()=>signOut(auth));
onAuthStateChanged(auth,u=>{
  if(unsub){unsub();unsub=null}
  $('auth').hidden=!!u;$('app').hidden=!u;$('who').hidden=!u;
  if(!u){S={habits:[],sel:'all'};ref=null;return}
  $('mail').textContent=u.email;
  try{S.habits=JSON.parse(localStorage.getItem(cacheKey()))||[]}catch(e){S.habits=[]}
  S.open=null;S.sel='all';render();
  ref=doc(db,'users',u.uid);
  unsub=onSnapshot(ref,snap=>{
    if(snap.metadata.hasPendingWrites)return;
    if(snap.exists()){
      try{S.habits=JSON.parse(snap.data().data)}catch(e){}
      try{localStorage.setItem(cacheKey(),JSON.stringify(S.habits))}catch(e){}
      if(!(document.activeElement&&document.activeElement.tagName==='TEXTAREA'))render();
    }else if(S.habits.length&&!snap.metadata.fromCache)save();
  });
});
