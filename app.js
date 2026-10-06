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
const LN=['None','Lowest','Low','Normal','Better','Best'];
const dateOf=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
// Levels are relative to the daily goal: Lowest <50%, Low 50%+, Normal 100%+, Better 150%+, Best 200%+
const levelOf=(h,v)=>{if(!(v>0))return 0;const r=v/h.goal;return r>=2?5:r>=1.5?4:r>=1?3:r>=.5?2:1};
const levelAmt=(h,n)=>Math.round([0,.25,.5,1,1.5,2][n]*h.goal*10)/10;
function setAmt(h,k,v){v=Math.max(0,Number(v)||0);if(v>0){h.done[k]=v;if(k<h.created)h.created=k}else delete h.done[k]}
function norm(h){if(!h.goal){h.goal=30;h.unit='min';for(const k in h.done)h.done[k]=30}
  h.unit=h.unit||'min';h.notes=h.notes||{};if(!h.created)h.created=Object.keys(h.done).sort()[0]||K(T())}
const span=(h,from)=>{const c=dateOf(h.created),f=c>from?c:from;return Math.max(1,Math.round((T()-f)/864e5)+1)};
const sumAmt=(h,from,to)=>{let n=0;for(let d=from;d<=to;d=add(d,1))n+=h.done[K(d)]||0;return Math.round(n*10)/10};
// Shade inside a level: 15 min and 20 min share a level color but 20 min is slightly stronger
const levelFrac=(h,v)=>{const r=v/h.goal;return Math.min(1,r>=2?r-2:r>=1.5?(r-1.5)*2:r>=1?(r-1)*2:r>=.5?(r-.5)*2:r*2)};
const shade=(lv,t)=>lv?` style="background:color-mix(in srgb,var(--l${lv}) ${Math.round(65+35*t)}%,var(--card))"`:'';
// Standard grid of W weeks. It starts in the week of the first day (earlier days stay blank),
// future days are empty squares, and it slides forward once the habit is older than W weeks.
function heatCells(one,H,P){
  const first=dateOf(one?one.created:(H.map(h=>h.created).sort()[0]||K(P.t)));
  const cur=mondayOf(P.t),wk0=mondayOf(first);
  const start=Math.round((cur-wk0)/6048e5)>=W?add(cur,-(W-1)*7):wk0;let cells='';
  for(let i=0;i<W*7;i++){const d=add(start,i),k=K(d);
    if(d<first){cells+='<div class="pre"></div>';continue}
    if(d>P.t){cells+='<div class="fut" data-pk="'+k+'" data-ph="'+(one?one.id:'')+'"></div>';continue}
    const ds=d.toLocaleDateString(undefined,{day:'numeric',month:'short'});let lv,t=0,label;
    if(one){const v=one.done[k]||0;lv=levelOf(one,v);t=v?levelFrac(one,v):0;label=ds+': '+(v?v+' '+one.unit+' ('+LN[lv]+')':(k===K(P.t)?'not logged yet':'0 '+one.unit))}
    else{const act=H.filter(h=>h.created<=k),sum=act.reduce((a,h)=>a+levelOf(h,h.done[k]||0),0),avg=act.length?sum/act.length:0;
      lv=sum?Math.max(1,Math.min(5,Math.round(avg))):0;t=lv?Math.min(1,Math.max(0,avg-lv+.5)):0;label=ds+': '+act.filter(h=>h.done[k]).length+' of '+act.length+' habits done'}
    const pend=k===K(P.t)&&(one?!one.done[k]:!H.some(h=>h.created<=k&&h.done[k]));
    cells+=`<button class="${pend?'pend':'l'+lv}${one?' edit':''}${k===K(P.t)?' now':''}${S.open&&one&&k===S.day?' sel':''}${one&&one.notes&&one.notes[k]?' hn':''}"${pend?'':shade(lv,t)} ${one?`data-day="${k}"`:'tabindex="-1"'} data-pk="${k}" data-ph="${one?one.id:''}" aria-label="${label}"></button>`}
  return cells}
function logHTML(h,k,sv=true){const dk=h.id+'|'+k,dirty=!!S.draft&&dk in S.draft&&S.draft[dk]!==(h.done[k]||0),v=dirty?S.draft[dk]:(h.done[k]||0),lv=levelOf(h,v),u=esc(h.unit);
  return `<span class="log"><input type="number" min="0" step="any" inputmode="decimal" value="${v||''}" placeholder="0" data-amt="${h.id}|${k}" aria-label="${u} done"><span>${u}</span>`+
  LN.map((nm,i)=>`<button class="lv l${i}" data-lvl="${h.id}|${k}|${i}" aria-pressed="${i===lv}" title="${nm}${i?' ('+levelAmt(h,i)+' '+u+')':''}" aria-label="${nm}">${i?'':'✕'}</button>`).join('')+`<span class="lvname">${LN[lv]}</span>`+(sv?`<button class="btn sv" data-save="${dk}">Save</button>`:'')+`<span class="uns">${dirty?'Unsaved':''}</span></span>`}
function markUnsaved(row){S.saved=false;const ss=$('savestate');if(ss)ss.textContent='Unsaved changes';const u=row&&row.querySelector('.uns');if(u)u.textContent='Unsaved'}
function saveDay(h,k){const dk=h.id+'|'+k;if(S.draft&&dk in S.draft){setAmt(h,k,S.draft[dk]);delete S.draft[dk]}
  const n=$('note');if(n){const v=n.value;if(v.trim())h.notes[k]=v;else delete h.notes[k]}S.noteDraft=null;S.saved=true}

function render(){
  S.habits.forEach(norm);const P=periods(),H=S.habits,n=H.length;
  const O=H.find(h=>h.id===S.open);if(!O)S.open=null;else S.sel=O.id;
  ['add','sumsec','listsec','heatsec'].forEach(i=>$(i).hidden=!!O);$('detail').hidden=!O;$('chips').hidden=!!O;
  $('date').textContent=P.t.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const td=H.filter(h=>h.done[K(P.t)]).length;
  const wkDone=H.reduce((a,h)=>a+count(h,P.wk,P.t),0),moDone=H.reduce((a,h)=>a+count(h,P.mo,P.t),0);
  const wkDen=H.reduce((a,h)=>a+span(h,P.wk),0),moDen=H.reduce((a,h)=>a+span(h,P.mo),0);
  const stats=[['Today',pct(td,n),td+' of '+n+' habits'],['This week',pct(wkDone,wkDen),wkDone+' of '+wkDen+' check-ins'],['This month',pct(moDone,moDen),moDone+' of '+moDen+' check-ins']];
  $('sum').innerHTML=stats.map(s=>`<div><span>${s[0]}</span><b>${s[1]}%</b><span>${n?s[2]:'No habits yet'}</span><div class="bar"><i style="width:${s[1]}%"></i></div></div>`).join('');

  $('chips').innerHTML=`<button class="chip" data-sel="all" aria-pressed="${S.sel==='all'}">All habits</button>`+H.map(h=>`<button class="chip" data-sel="${h.id}" aria-pressed="${S.sel===h.id}">${esc(h.name)}</button>`).join('');
  const one=H.find(h=>h.id===S.sel);if(!one)S.sel='all';
  $('heat').innerHTML=heatCells(one,H,P);
  $('legend').innerHTML='None '+[0,1,2,3,4,5].map(i=>`<i style="background:var(--l${i})"></i>`).join('')+' Best · Hover or click a day for details';

  $('list').innerHTML=n?H.map(h=>{const w=count(h,P.wk,P.t),m=count(h,P.mo,P.t),sw=span(h,P.wk);
    return `<div class="habit">
    <div><button class="name nm" data-open="${h.id}">${esc(h.name)}</button>${h.desc?`<div class="desc">${esc(h.desc)}</div>`:''}<div class="meta"><span>Streak <b>${streak(h)}</b> days</span><span>Best <b>${best(h)}</b></span><button class="rm" data-rm="${h.id}">Remove</button></div><div class="logrow">Today ${logHTML(h,K(P.t))}</div></div>
    <div class="bars"><div>Week: ${w} of ${sw} days · ${sumAmt(h,P.wk,P.t)} ${esc(h.unit)}<div class="bar"><i style="width:${pct(w,sw)}%"></i></div></div><div>Month: ${m} of ${P.moTotal} days · ${sumAmt(h,P.mo,P.t)} ${esc(h.unit)}<div class="bar"><i style="width:${pct(m,P.moTotal)}%"></i></div></div></div></div>`}).join('')
    :'<p class="empty">Add your first habit above. Name it by the action, like “Walk 30 minutes”.</p>';
}
const fmt=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})};
function renderNotes(h){const ks=Object.keys(h.notes||{}).filter(k=>h.notes[k]).sort().reverse();
  $('notelist').innerHTML=ks.length?ks.map(k=>`<button class="nt" data-day="${k}"><b>${fmt(k)}</b><span>${esc(h.notes[k])}</span></button>`).join(''):'<p class="empty">No notes yet. Pick a day and write one.</p>'}
function renderDetail(h){const k=S.day||K(T());S.day=k;
  $('detail').innerHTML=`<button class="rm" data-back="1">← All habits</button>
  <h2 class="dname">${esc(h.name)}</h2>
  <div class="meta"><span>Streak <b>${streak(h)}</b> days</span><span>Best <b>${best(h)}</b></span><span>Done <b>${Object.keys(h.done).length}</b> days in total</span></div>
  <h2 style="margin-top:16px">Heatmap</h2><div class="scroll"><div class="heat" id="heatH">${heatCells(h,S.habits,periods())}</div></div>
  <div class="legend">None ${[0,1,2,3,4,5].map(i=>`<i style="background:var(--l${i})"></i>`).join('')} Best · Hover or click a day for details</div>
  <label for="goalAmt" style="margin-top:14px">Daily goal</label>
  <div class="dayrow"><input type="number" id="goalAmt" min="1" step="any" value="${h.goal}" style="flex:0 0 110px"><input id="unitIn" value="${esc(h.unit)}" maxlength="12" style="flex:0 0 90px" aria-label="Unit"></div>
  <label for="desc">Description (optional)</label>
  <textarea id="desc" rows="2" placeholder="What are you aiming for, and why?">${esc(h.desc||'')}</textarea>
  <label for="dayPick">Day</label>
  <div class="dayrow"><input type="date" id="dayPick" value="${k}" max="${K(T())}">${logHTML(h,k,false)}</div>
  <p class="hint">Lowest = under half your goal · Low = half · Normal = your goal · Better = 1.5× · Best = 2×</p>
  <textarea id="note" rows="4" aria-label="Note for ${fmt(k)}" placeholder="Note for ${fmt(k)} (optional)">${esc(S.noteDraft&&S.noteDraft.k===k?S.noteDraft.v:(h.notes||{})[k]||'')}</textarea>
  <div class="dayrow"><button class="btn" data-saveday="1">Save day</button><span id="savestate" role="status">${S.saved?'Saved ✓':''}</span></div>
  <h2>All notes</h2><div id="notelist"></div>`;
  renderNotes(h)}
const _r=render;render=()=>{hidePop();_r();const O=S.habits.find(h=>h.id===S.open);if(O)renderDetail(O)};
const flip=(h,k)=>{h.done[k]?delete h.done[k]:setAmt(h,k,levelAmt(h,3))};
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.sel){S.sel=t.dataset.sel}
  else if(t.dataset.lvl){const [id,k,i]=t.dataset.lvl.split('|');const h=S.habits.find(x=>x.id===id);if(h){(S.draft=S.draft||{})[id+'|'+k]=levelAmt(h,+i);S.saved=false}}
  else if(t.dataset.save){const [id,k]=t.dataset.save.split('|');const h=S.habits.find(x=>x.id===id);if(h){if(S.draft&&t.dataset.save in S.draft){setAmt(h,k,S.draft[t.dataset.save]);delete S.draft[t.dataset.save]}}}
  else if(t.dataset.saveday){const h=S.habits.find(x=>x.id===S.open);if(h)saveDay(h,S.day)}
  else if(t.dataset.day){if(S.open){S.day=t.dataset.day;S.draft={};S.noteDraft=null;S.saved=false}else{return}}
  else if(t.dataset.open){S.open=t.dataset.open;S.day=K(T());S.draft={};S.noteDraft=null;S.saved=false;window.scrollTo(0,0)}
  else if(t.dataset.back){S.open=null;S.sel='all';S.draft={};S.noteDraft=null}
  else if(t.dataset.editday){const [id,k]=t.dataset.editday.split('|');S.open=id;S.sel=id;S.day=k;S.draft={};S.noteDraft=null;S.saved=false;hidePop();window.scrollTo(0,0)}
  else if(t.dataset.rm){S.habits=S.habits.filter(h=>h.id!==t.dataset.rm);if(S.sel===t.dataset.rm)S.sel='all'}
  else return;
  save();render()});
$('add').addEventListener('submit',e=>{e.preventDefault();const v=$('name').value.trim();if(!v)return;
  S.habits.push({id:'h'+Date.now().toString(36),name:v,goal:Math.max(1,Number($('goal').value)||30),unit:$('unit').value.trim()||'min',created:K(T()),done:{},notes:{}});$('name').value='';save();render()});
document.addEventListener('input',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;
  if(e.target.id==='goalAmt'){const g=Number(e.target.value);if(g>0)h.goal=g;else return}
  else if(e.target.id==='unitIn'){h.unit=e.target.value.trim()||'min'}
  else if(e.target.id==='desc'){h.desc=e.target.value}
  else if(e.target.id==='note'){S.noteDraft={k:S.day,v:e.target.value};markUnsaved();return}
  else return;save()});
document.addEventListener('change',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;const id=e.target.id;
  if(id==='dayPick'&&e.target.value){S.day=e.target.value;S.draft={};S.noteDraft=null;S.saved=false;render()}
  else if(id==='dayDone'){flip(h,S.day);save();render()}
  else if(id==='goalAmt'||id==='unitIn')render();
  else if(id==='note')renderNotes(h)});
document.addEventListener('input',e=>{const a=e.target.dataset&&e.target.dataset.amt;if(!a)return;
  const h=S.habits.find(x=>x.id===a.split('|')[0]);if(!h)return;
  const v=Math.max(0,Number(e.target.value)||0);(S.draft=S.draft||{})[a]=v;
  const row=e.target.closest('.log'),lv=levelOf(h,v);
  row.querySelectorAll('.lv').forEach((b,i)=>b.setAttribute('aria-pressed',i===lv));
  row.querySelector('.lvname').textContent=LN[lv];markUnsaved(row)});
const root=document.documentElement;
const isDark=()=>root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
const paintTheme=()=>{$('theme').textContent=isDark()?'☀ Light mode':'☾ Dark mode'};
$('theme').addEventListener('click',()=>{const t=isDark()?'light':'dark';root.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}paintTheme()});
paintTheme();
const pop={el:null,cell:null,pinned:false,key:''};
function popHTML(k,hid){
  const P=periods(),H=S.habits,d=dateOf(k),today=k===K(P.t),one=hid&&H.find(x=>x.id===hid);
  let out=`<div class="ph">${d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</div>`;
  if(d>P.t)return out+'<div class="pl">Upcoming</div>';
  const line=h=>{const v=h.done[k]||0,lv=levelOf(h,v),n=(h.notes||{})[k],u=esc(h.unit);
    const txt=v?`<b>${v} ${u}</b> · ${LN[lv]}`:(today?'Not logged yet':`<b>0 ${u}</b> · None`);
    return `<div class="pl"><i class="pd" style="background:var(--${v||!today?'l'+lv:'pend'})"></i>${one?'':esc(h.name)+': '}${txt}${n?`<div class="pn">${esc(n)}</div>`:''}</div>`};
  out+=one?line(one):H.filter(h=>h.created<=k).map(line).join('');
  if(one&&!S.open)out+=`<button class="btn sv" style="margin-top:10px" data-editday="${one.id}|${k}">Edit this day</button>`;
  return out}
function showPop(c,pin){
  if(!pop.el){pop.el=document.createElement('div');pop.el.id='pop';pop.el.setAttribute('role','tooltip');document.body.appendChild(pop.el)}
  const p=pop.el;p.innerHTML=popHTML(c.dataset.pk,c.dataset.ph);p.hidden=false;
  const r=c.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight;
  p.style.left=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8))+'px';
  p.style.top=(r.top-h-8<8?r.bottom+8:r.top-h-8)+'px';
  pop.cell=c;pop.pinned=!!pin;pop.key=c.dataset.pk+'|'+c.dataset.ph}
function hidePop(){if(pop.el)pop.el.hidden=true;pop.cell=null;pop.pinned=false;pop.key=''}
document.addEventListener('mouseover',e=>{const c=e.target.closest&&e.target.closest('.heat [data-pk]');if(c&&!pop.pinned)showPop(c,false)});
document.addEventListener('mouseout',e=>{if(!pop.pinned&&e.target.closest&&e.target.closest('.heat [data-pk]'))hidePop()});
document.addEventListener('click',e=>{const c=e.target.closest&&e.target.closest('.heat [data-pk]');
  if(!c){if(!e.target.closest('#pop'))hidePop();return}
  if(pop.pinned&&pop.key===c.dataset.pk+'|'+c.dataset.ph){hidePop();return}
  const live=[...document.querySelectorAll('.heat [data-pk]')].find(x=>x.dataset.pk===c.dataset.pk&&x.dataset.ph===c.dataset.ph&&x.offsetParent!==null)||c;
  showPop(live,true)});
window.addEventListener('scroll',hidePop,{passive:true});window.addEventListener('resize',hidePop);
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
