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

const isOff=(h,k)=>!!h.off&&h.off[k]!==undefined;
// A day is a success: regular habits = something logged, stop habits = at or under the limit (unlogged past days count as 0)
function ok(h,k){const v=h.done[k]||0;
  if(!h.stop)return v>0;
  return (v>0||!!(h.skip||{})[k]||k<K(T()))&&v<=(h.type==='bool'?0:h.goal)}
function streak(h){let d=T(),n=0;const c=dateOf(h.created);if(!isOff(h,K(d))&&!ok(h,K(d)))d=add(d,-1);
  while(d>=c){const k=K(d);if(isOff(h,k)){d=add(d,-1);continue}if(!ok(h,k))break;n++;d=add(d,-1)}return n}
function best(h){let b=0,run=0;for(let d=dateOf(h.created);d<=T();d=add(d,1)){const k=K(d);if(isOff(h,k))continue;if(ok(h,k)){run++;if(run>b)b=run}else run=0}return b}
function count(h,from,to){let n=0;const c=dateOf(h.created);for(let d=from<c?c:from;d<=to;d=add(d,1)){const k=K(d);if(!isOff(h,k)&&ok(h,k))n++}return n}
const TYPES={min:{unit:'min',goal:30,stop:60},hour:{unit:'hr',goal:1,stop:2},pages:{unit:'pages',goal:10,stop:30},problems:{unit:'problems solved',goal:3},times:{unit:'times',goal:1},bool:{unit:''}};
const txtAmt=(h,v)=>h.type==='bool'?(h.stop?(v>0?'Slipped':'Avoided it'):(v>0?'Done':'Not done')):`${v} ${esc(h.unit)}`;
const typeLabel=h=>({min:'Minutes',hour:'Hours',pages:h.unit==='chapters'?'Chapters':'Pages',problems:'Problems',times:'Number of times',bool:'True / false'})[h.type]+(h.stop?' · Stop habit (less is better)':'');
function levelHint(h){
  if(h.type==='bool')return h.stop?'Choose one and press Save. A day left empty counts as "Avoided it".':'Choose one and press Save. A day left empty counts as "Not done".';
  if(h.stop)return 'Best = none · Better = up to half your limit · Normal = up to your limit · Low = up to 1.5× · Lowest = up to 2× · None = more than 2×. A day left empty counts as 0.';
  return 'Lowest = under half your goal · Low = half · Normal = your goal · Better = 1.5× · Best = 2×. Leave the box empty for "not logged" (counts as 0), or press the dark red square to record a skipped day.'}
function goalEditor(h){
  const head=`<p class="hint" style="margin-top:14px">${typeLabel(h)}</p>`;
  if(h.type==='bool')return head;
  return head+`<label for="goalAmt">${h.stop?'Daily limit':'Daily goal'}</label>
  <div class="dayrow"><input type="number" id="goalAmt" min="0" step="any" value="${h.goal}" style="flex:0 0 110px"><input id="unitIn" value="${esc(h.unit)}" maxlength="24" style="flex:0 0 150px" aria-label="Unit"></div>`}
function newHabit(name){const type=$('type').value,stop=$('stop').checked&&!$('stopWrap').hidden;
  let unit=TYPES[type].unit;if(type==='pages'||type==='problems')unit=$('sub').value;
  const g=Number($('goal').value),goal=type==='bool'?1:(g>0?g:(stop?TYPES[type].stop:TYPES[type].goal));
  return {id:'h'+Date.now().toString(36),name,type,stop,goal,unit,created:K(T()),done:{},skip:{},notes:{}}}
function syncForm(typeChanged){const type=$('type').value,canStop=['min','hour','pages','bool'].includes(type);
  $('stopWrap').hidden=!canStop;if(!canStop)$('stop').checked=false;
  const stop=$('stop').checked,subs={pages:[['pages','Pages'],['chapters','Chapters']],problems:[['problems solved','Solved'],['problems tried','Tried']]}[type];
  $('sub').hidden=!subs;if(subs&&typeChanged)$('sub').innerHTML=subs.map(s=>`<option value="${s[0]}">${s[1]}</option>`).join('');
  $('goalWrap').hidden=type==='bool';$('goalLbl').textContent=stop?'Daily limit':'Daily goal';
  $('goal').value=stop?TYPES[type].stop:TYPES[type].goal;$('goalUnit').textContent=subs?'':TYPES[type].unit}
function periods(){const t=T();const wk=mondayOf(t);const mo=new Date(t.getFullYear(),t.getMonth(),1);
  return{t,wk,mo,wkDays:Math.round((t-wk)/864e5)+1,moDays:t.getDate(),moTotal:new Date(t.getFullYear(),t.getMonth()+1,0).getDate()}}
const pct=(a,b)=>b?Math.round(a/b*100):0;
const LN=['None','Lowest','Low','Normal','Better','Best'];
const dateOf=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
// Levels are relative to the daily goal: Lowest <50%, Low 50%+, Normal 100%+, Better 150%+, Best 200%+
const levelOf=(h,v)=>{
  if(h.type==='bool')return h.stop?(v>0?0:5):(v>0?5:0);
  const r=v/h.goal;
  if(h.stop)return r<=0?5:r<=.5?4:r<=1?3:r<=1.5?2:r<=2?1:0;
  return !(v>0)?0:r>=2?5:r>=1.5?4:r>=1?3:r>=.5?2:1};
const levelAmt=(h,n)=>Math.round((h.stop?[2.5,2,1.5,1,.25,0][n]:[0,.25,.5,1,1.5,2][n])*h.goal*10)/10;
// v: number>0 = amount, 0 = deliberately skipped, null = back to not logged
function setAmt(h,k,v){h.skip=h.skip||{};
  if(v===null||v===undefined){delete h.done[k];delete h.skip[k];return}
  v=Math.max(0,Number(v)||0);
  if(v>0){h.done[k]=v;delete h.skip[k]}else{delete h.done[k];h.skip[k]=1}
  if(k<h.created)h.created=k}
function norm(h){if(!h.goal){h.goal=30;h.unit='min';for(const k in h.done)h.done[k]=30}
  h.type=h.type||'min';h.stop=!!h.stop;h.unit=h.type==='bool'?'':(h.unit||'min');h.notes=h.notes||{};h.skip=h.skip||{};h.off=h.off||{};if(!h.created)h.created=Object.keys(h.done).sort()[0]||K(T())}
const span=(h,from)=>{const c=dateOf(h.created),f=c>from?c:from;let n=0;for(let d=f;d<=T();d=add(d,1))if(!isOff(h,K(d)))n++;return Math.max(1,n)};
const sumAmt=(h,from,to)=>{let n=0;for(let d=from;d<=to;d=add(d,1))n+=h.done[K(d)]||0;return Math.round(n*10)/10};
// Shade inside a level: 15 min and 20 min share a level color but 20 min is slightly stronger
const levelFrac=(h,v)=>{if(h.type==='bool')return 1;const r=v/h.goal;
  if(h.stop){if(r<=0)return 1;return Math.max(0,Math.min(1,1-(((r-1e-9)%.5)/.5)))}
  return Math.min(1,r>=2?r-2:r>=1.5?(r-1.5)*2:r>=1?(r-1)*2:r>=.5?(r-.5)*2:r*2)};
// Continuous cool gradient: every amount gets its own color (red only for a zero / failed day)
const GRAD=[[0,'#EF4466'],[.15,'#B83DBA'],[.30,'#6C4FE0'],[.45,'#2F7BEA'],[.62,'#10B5C9'],[.80,'#27D68F'],[1,'#B8F26B']].map(([p,c])=>[p,[1,3,5].map(i=>parseInt(c.slice(i,i+2),16))]);
function gradColor(s){s=Math.max(0,Math.min(1,s));let i=1;while(i<GRAD.length-1&&s>GRAD[i][0])i++;
  const [p0,a]=GRAD[i-1],[p1,b]=GRAD[i],f=(s-p0)/(p1-p0);return 'rgb('+a.map((x,j)=>Math.round(x+(b[j]-x)*f)).join(',')+')'}
// Second palette: GitHub-style greens (light = a little, dark = a lot), red = zero
const GH=[[0,'#D4F5DA'],[.35,'#8FE0A0'],[.6,'#3FC463'],[.8,'#2E9E4F'],[1,'#14602E']].map(([p,c])=>[p,[1,3,5].map(i=>parseInt(c.slice(i,i+2),16))]);
function ghColor(s){if(!(s>0))return 'rgb(224,51,76)';s=Math.min(1,s);let i=1;while(i<GH.length-1&&s>GH[i][0])i++;
  const [p0,a]=GH[i-1],[p1,b]=GH[i],f=(s-p0)/(p1-p0);return 'rgb('+a.map((x,j)=>Math.round(x+(b[j]-x)*f)).join(',')+')'}
const scoreColor=s=>document.documentElement.dataset.palette==='github'?ghColor(s):gradColor(s);
// 0..1 score of a day: regular = more is better (goal reached is about 0.57), stop = less is better
const dayScore=(h,v)=>{if(h.type==='bool')return (h.stop?v<=0:v>0)?.9:0;
  const r=Math.min(1,v/(2*h.goal));return h.stop?1-r:(v>0?.15+.85*r:0)};
// Standard grid of W weeks. It starts in the week of the first day (earlier days stay blank),
// future days are empty squares, and it slides forward once the habit is older than W weeks.
function heatCells(one,H,P){
  const first=dateOf(one?one.created:(H.map(h=>h.created).sort()[0]||K(P.t)));
  const cur=mondayOf(P.t),wk0=mondayOf(first);
  const start=Math.round((cur-wk0)/6048e5)>=W?add(cur,-(W-1)*7):wk0;let cells='';
  for(let i=0;i<W*7;i++){const d=add(start,i),k=K(d);
    if(d<first){cells+='<div class="pre"></div>';continue}
    if(d>P.t){cells+='<div class="fut" data-pk="'+k+'" data-ph="'+(one?one.id:'')+'"></div>';continue}
    const ds=d.toLocaleDateString(undefined,{day:'numeric',month:'short'}),isT=k===K(P.t),lg=h=>h.done[k]>0||!!(h.skip||{})[k];
    if(!one){const all=H.filter(h=>h.created<=k);if(all.length&&all.every(h=>isOff(h,k))){cells+=`<button class="skip${isT?' now':''}" tabindex="-1" data-pk="${k}" data-ph="" aria-label="${ds}: all habits skipped"></button>`;continue}}
    if(one&&isOff(one,k)){cells+=`<button class="skip edit${isT?' now':''}${S.open&&k===S.day?' sel':''}${one.notes&&one.notes[k]?' hn':''}" data-day="${k}" data-pk="${k}" data-ph="${one.id}" aria-label="${ds}: skipped (${esc(one.off[k]||'no reason')})"></button>`;continue}
    let lv,sc=0,label,logged;
    if(one){const v=one.done[k]||0;logged=lg(one);lv=levelOf(one,v);sc=dayScore(one,v);
      label=ds+': '+(logged?txtAmt(one,v)+' ('+LN[lv]+')':isT?'not logged yet':'not logged, counted as '+txtAmt(one,0))}
    else{const act=H.filter(h=>h.created<=k&&!isOff(h,k)),sum=act.reduce((a,h)=>a+levelOf(h,h.done[k]||0),0),avg=act.length?sum/act.length:0;
      logged=act.some(lg);lv=sum?Math.max(1,Math.min(5,Math.round(avg))):0;sc=act.length?act.reduce((a,h)=>a+dayScore(h,h.done[k]||0),0)/act.length:0;
      label=ds+': '+act.filter(lg).length+' of '+act.length+' habits logged'}
    const pend=isT&&!logged,miss=!isT&&!logged;
    cells+=`<button class="${pend?'pend':miss?'miss'+(lv>=3?' good':''):'l'+lv}${one?' edit':''}${isT?' now':''}${S.open&&one&&k===S.day?' sel':''}${one&&one.notes&&one.notes[k]?' hn':''}"${pend||miss?'':` style="background-color:${scoreColor(sc)}"`} ${one?`data-day="${k}"`:'tabindex="-1"'} data-pk="${k}" data-ph="${one?one.id:''}" aria-label="${label}"></button>`}
  return cells}
// Streak badge: the flame grows and glows as the streak gets longer
function streakHTML(h){const n=streak(h),bst=best(h),tier=n>=30?4:n>=14?3:n>=7?2:n>=3?1:n>=1?0:-1;
  const risk=n&&!isOff(h,K(T()))&&!(h.done[K(T())]>0||(h.skip||{})[K(T())])?'<span class="risk">Log today to keep it going</span>':'';
  if(tier<0)return `<span class="streak s-off"><span class="flame">🔥</span>No streak yet</span><span>Best <b>${bst}</b></span>`;
  return `<span class="streak s${tier}" title="Best streak: ${bst} days"><span class="flame">🔥</span><b>${n}</b> day${n===1?'':'s'}</span><span>Best <b>${bst}</b></span>${risk}`}
function logHTML(h,k,sv=true){const dk=h.id+'|'+k,cur=h.done[k]>0?h.done[k]:((h.skip||{})[k]?0:null),
  dirty=!!S.draft&&dk in S.draft&&S.draft[dk]!==cur,v=dirty?S.draft[dk]:cur,u=esc(h.unit);
  if(isOff(h,k))return `<span class="log"><span class="skipbadge">Skipped · ${esc(h.off[k]||'no reason')}</span><button class="btn alt sv" data-unskip="${dk}">Undo skip</button></span>`;
  if(S.skipFor===dk)return `<span class="log skippanel"><select class="skipReason" aria-label="Reason">${['Ill','Travel','Rest','Busy','Other…'].map(r=>`<option>${r}</option>`).join('')}</select><input class="skipCustom" placeholder="Reason" maxlength="40" hidden aria-label="Custom reason"><button class="btn sv" data-skipgo="${dk}">Skip this day</button><button class="btn alt sv" data-skipcancel="1">Cancel</button></span>`;
  const tail=(sv?`<button class="btn sv" data-save="${dk}">Save</button>`:'')+`<button class="btn alt sv" data-skipopen="${dk}">Skip day</button><span class="uns">${dirty?'Unsaved':''}</span></span>`;
  if(h.type==='bool'){const opts=h.stop?[[0,'Avoided it',5],[1,'Slipped',0]]:[[1,'Done',5],[0,'Not done',0]];
    return '<span class="log">'+opts.map(o=>`<button class="bt l${o[2]}" data-bool="${dk}|${o[0]}" aria-pressed="${v!==null&&v===o[0]}">${o[1]}</button>`).join('')+tail}
  const lv=v===null?-1:levelOf(h,v);
  return `<span class="log"><input type="number" min="0" step="any" inputmode="decimal" value="${v===null?'':v}" placeholder="0" data-amt="${dk}" aria-label="${u} done"><span>${u}</span>`+
  LN.map((nm,i)=>`<button class="lv l${i}" data-lvl="${dk}|${i}" aria-pressed="${i===lv}" title="${nm} (${levelAmt(h,i)} ${u})" aria-label="${nm}"></button>`).join('')+
  `<span class="lvname">${lv<0?(k===K(T())?'Not logged yet':'Not logged'):LN[lv]}</span>`+tail}
function markUnsaved(row){S.saved=false;const ss=$('savestate');if(ss)ss.textContent='Unsaved changes';const u=row&&row.querySelector('.uns');if(u)u.textContent='Unsaved'}
function saveDay(h,k){const dk=h.id+'|'+k;if(S.draft&&dk in S.draft){setAmt(h,k,S.draft[dk]);delete S.draft[dk]}
  const n=$('note');if(n){const v=n.value;if(v.trim())h.notes[k]=v;else delete h.notes[k]}S.noteDraft=null;S.saved=true}

function render(){
  S.habits.forEach(norm);const P=periods(),H=S.habits,n=H.length;
  const O=H.find(h=>h.id===S.open);if(!O)S.open=null;else S.sel=O.id;
  ['add','sumsec','listsec','heatsec'].forEach(i=>$(i).hidden=!!O);$('detail').hidden=!O;$('chips').hidden=!!O;
  $('date').textContent=P.t.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const tAct=H.filter(h=>!isOff(h,K(P.t))),td=tAct.filter(h=>ok(h,K(P.t))).length;
  const wkDone=H.reduce((a,h)=>a+count(h,P.wk,P.t),0),moDone=H.reduce((a,h)=>a+count(h,P.mo,P.t),0);
  const wkDen=H.reduce((a,h)=>a+span(h,P.wk),0),moDen=H.reduce((a,h)=>a+span(h,P.mo),0);
  const stats=[['Today',pct(td,tAct.length),td+' of '+tAct.length+' habits'],['This week',pct(wkDone,wkDen),wkDone+' of '+wkDen+' check-ins'],['This month',pct(moDone,moDen),moDone+' of '+moDen+' check-ins']];
  $('sum').innerHTML=stats.map(s=>`<div><span>${s[0]}</span><b>${s[1]}%</b><span>${n?s[2]:'No habits yet'}</span><div class="bar"><i style="width:${s[1]}%"></i></div></div>`).join('');

  $('chips').innerHTML=`<button class="chip" data-sel="all" aria-pressed="${S.sel==='all'}">All habits</button>`+H.map(h=>`<button class="chip" data-sel="${h.id}" aria-pressed="${S.sel===h.id}">${esc(h.name)}</button>`).join('');
  const one=H.find(h=>h.id===S.sel);if(!one)S.sel='all';
  $('heat').innerHTML=heatCells(one,H,P);
  $('legend').innerHTML='None <i class="gbar"></i> Best · <i class="lgm"></i> Not logged (counts as 0) · <i class="sksw"></i> Skipped · Hover or click a day for details';

  $('list').innerHTML=n?H.map(h=>{const w=count(h,P.wk,P.t),m=count(h,P.mo,P.t),sw=span(h,P.wk),mt=Math.max(1,P.moTotal-Object.keys(h.off||{}).filter(x=>x.startsWith(K(P.mo).slice(0,7))).length);
    return `<div class="habit">
    <div><button class="name nm" data-open="${h.id}">${esc(h.name)}</button>${h.desc?`<div class="desc">${esc(h.desc)}</div>`:''}<div class="meta">${streakHTML(h)}<button class="rm" data-rm="${h.id}">Remove</button></div><div class="logrow">Today ${logHTML(h,K(P.t))}</div></div>
    <div class="bars"><div>Week: ${w} of ${sw} days${h.type==='bool'?'':' · '+sumAmt(h,P.wk,P.t)+' '+esc(h.unit)}<div class="bar"><i style="width:${pct(w,sw)}%"></i></div></div><div>Month: ${m} of ${mt} days${h.type==='bool'?'':' · '+sumAmt(h,P.mo,P.t)+' '+esc(h.unit)}<div class="bar"><i style="width:${pct(m,mt)}%"></i></div></div></div></div>`}).join('')
    :'<p class="empty">Add your first habit above. Name it by the action, like “Walk 30 minutes”.</p>';
}
const fmt=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})};
function renderNotes(h){const ks=Object.keys(h.notes||{}).filter(k=>h.notes[k]).sort().reverse();
  $('notelist').innerHTML=ks.length?ks.map(k=>`<button class="nt" data-day="${k}"><b>${fmt(k)}</b><span>${esc(h.notes[k])}</span></button>`).join(''):'<p class="empty">No notes yet. Pick a day and write one.</p>'}
function renderDetail(h){const k=S.day||K(T());S.day=k;
  $('detail').innerHTML=`<button class="rm" data-back="1">← All habits</button>
  <h2 class="dname">${esc(h.name)}</h2>
  <div class="dayrow"><input id="nameIn" value="${esc(h.name)}" maxlength="60" aria-label="Habit name"><button class="btn sv" data-rename="1">Rename</button></div>
  <div class="meta">${streakHTML(h)}<span>Done <b>${Object.keys(h.done).length}</b> days in total</span></div>
  <h2 style="margin-top:16px">Heatmap</h2><div class="scroll"><div class="heat" id="heatH">${heatCells(h,S.habits,periods())}</div></div>
  <div class="legend">None <i class="gbar"></i> Best · <i class="lgm"></i> Not logged (counts as 0) · <i class="sksw"></i> Skipped · Hover or click a day for details</div>
  ${goalEditor(h)}
  <label for="desc">Description (optional)</label>
  <textarea id="desc" rows="2" placeholder="What are you aiming for, and why?">${esc(h.desc||'')}</textarea>
  <label for="dayPick">Day</label>
  <div class="dayrow"><input type="date" id="dayPick" value="${k}" max="${K(T())}">${logHTML(h,k,false)}</div>
  <p class="hint">${levelHint(h)} "Skip day" pauses a day without breaking or adding to your streak.</p>
  <textarea id="note" rows="4" aria-label="Note for ${fmt(k)}" placeholder="Note for ${fmt(k)} (optional)">${esc(S.noteDraft&&S.noteDraft.k===k?S.noteDraft.v:(h.notes||{})[k]||'')}</textarea>
  <div class="dayrow"><button class="btn" data-saveday="1">Save day</button><span id="savestate" role="status">${S.saved?'Saved ✓':''}</span></div>
  <h2>All notes</h2><div id="notelist"></div>`;
  renderNotes(h)}
const _r=render;render=()=>{hidePop();_r();const O=S.habits.find(h=>h.id===S.open);if(O)renderDetail(O)};
const flip=(h,k)=>{h.done[k]?delete h.done[k]:setAmt(h,k,levelAmt(h,3))};
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
  if(t.dataset.sel){S.sel=t.dataset.sel}
  else if(t.dataset.lvl){const [id,k,i]=t.dataset.lvl.split('|');const h=S.habits.find(x=>x.id===id);if(h){(S.draft=S.draft||{})[id+'|'+k]=levelAmt(h,+i);S.saved=false}}
  else if(t.dataset.skipopen){S.skipFor=t.dataset.skipopen}
  else if(t.dataset.skipcancel){S.skipFor=null}
  else if(t.dataset.skipgo){const [id,k]=t.dataset.skipgo.split('|'),h=S.habits.find(x=>x.id===id);
    if(h){const pn=t.closest('.skippanel');let r=pn.querySelector('select').value;if(r==='Other…')r=pn.querySelector('input').value.trim()||'Other';
      h.off=h.off||{};h.off[k]=r;delete h.done[k];delete h.skip[k];if(k<h.created)h.created=k;if(S.draft)delete S.draft[t.dataset.skipgo]}S.skipFor=null}
  else if(t.dataset.unskip){const [id,k]=t.dataset.unskip.split('|'),h=S.habits.find(x=>x.id===id);if(h&&h.off)delete h.off[k]}
  else if(t.dataset.bool){const [id,k,val]=t.dataset.bool.split('|');(S.draft=S.draft||{})[id+'|'+k]=+val;S.saved=false}
  else if(t.dataset.save){const [id,k]=t.dataset.save.split('|');const h=S.habits.find(x=>x.id===id);if(h){if(S.draft&&t.dataset.save in S.draft){setAmt(h,k,S.draft[t.dataset.save]);delete S.draft[t.dataset.save]}}}
  else if(t.dataset.saveday){const h=S.habits.find(x=>x.id===S.open);if(h)saveDay(h,S.day)}
  else if(t.dataset.rename){const h=S.habits.find(x=>x.id===S.open),v=$('nameIn').value.trim();if(h&&v)h.name=v}
  else if(t.dataset.day){if(S.open){S.day=t.dataset.day;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false}else{return}}
  else if(t.dataset.open){S.open=t.dataset.open;S.day=K(T());S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;window.scrollTo(0,0)}
  else if(t.dataset.back){S.open=null;S.sel='all';S.draft={};S.noteDraft=null;S.skipFor=null}
  else if(t.dataset.editday){const [id,k]=t.dataset.editday.split('|');S.open=id;S.sel=id;S.day=k;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;hidePop();window.scrollTo(0,0)}
  else if(t.dataset.rm){S.habits=S.habits.filter(h=>h.id!==t.dataset.rm);if(S.sel===t.dataset.rm)S.sel='all'}
  else return;
  save();render()});
$('add').addEventListener('submit',e=>{e.preventDefault();const v=$('name').value.trim();if(!v)return;
  S.habits.push(newHabit(v));$('name').value='';save();render()});
document.addEventListener('input',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;
  if(e.target.id==='goalAmt'){const g=Number(e.target.value);if(g>0)h.goal=g;else return}
  else if(e.target.id==='unitIn'){h.unit=e.target.value.trim()||'min'}
  else if(e.target.id==='desc'){h.desc=e.target.value}
  else if(e.target.id==='note'){S.noteDraft={k:S.day,v:e.target.value};markUnsaved();return}
  else return;save()});
document.addEventListener('change',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;const id=e.target.id;
  if(id==='dayPick'&&e.target.value){S.day=e.target.value;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;render()}
  else if(id==='dayDone'){flip(h,S.day);save();render()}
  else if(id==='goalAmt'||id==='unitIn')render();
  else if(id==='note')renderNotes(h)});
document.addEventListener('input',e=>{const a=e.target.dataset&&e.target.dataset.amt;if(!a)return;
  const h=S.habits.find(x=>x.id===a.split('|')[0]);if(!h)return;
  const raw=e.target.value,v=raw===''?null:Math.max(0,Number(raw)||0);(S.draft=S.draft||{})[a]=v;
  const row=e.target.closest('.log'),lv=v===null?-1:levelOf(h,v);
  row.querySelectorAll('.lv').forEach((b,i)=>b.setAttribute('aria-pressed',i===lv));
  row.querySelector('.lvname').textContent=lv<0?'Not logged':LN[lv];markUnsaved(row)});
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
  const line=h=>{if(isOff(h,k)){const n0=(h.notes||{})[k];return `<div class="pl"><i class="pd" style="background:var(--skip)"></i>${one?'':esc(h.name)+': '}<b>Skipped</b> · ${esc(h.off[k]||'no reason')}${n0?`<div class="pn">${esc(n0)}</div>`:''}</div>`}
    const v=h.done[k]||0,lg=v>0||!!(h.skip||{})[k],lv=levelOf(h,v),n=(h.notes||{})[k];
    const nm=lg&&v===0&&!h.stop&&h.type!=='bool'?'Skipped':LN[lv];
    const txt=lg?`<b>${txtAmt(h,v)}</b> · ${nm}`:(today?'Not logged yet':'Not logged · counted as '+txtAmt(h,0));
    return `<div class="pl"><i class="pd${!lg&&!today?' miss'+(lv>=3?' good':''):''}" style="${lg?'background:'+scoreColor(dayScore(h,v)):today?'background:var(--pend)':''}"></i>${one?'':esc(h.name)+': '}${txt}${n?`<div class="pn">${esc(n)}</div>`:''}</div>`};
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
$('type').addEventListener('change',()=>syncForm(true));$('stop').addEventListener('change',()=>syncForm(false));syncForm(true);
$('palette').value=document.documentElement.dataset.palette||'gradient';
$('palette').addEventListener('change',e=>{const p=e.target.value;document.documentElement.dataset.palette=p;try{localStorage.setItem('palette',p)}catch(x){}render()});
document.addEventListener('change',e=>{if(e.target.classList&&e.target.classList.contains('skipReason'))e.target.closest('.skippanel').querySelector('input').hidden=e.target.value!=='Other…'});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='nameIn'){e.preventDefault();const b=document.querySelector('[data-rename]');if(b)b.click()}});
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
