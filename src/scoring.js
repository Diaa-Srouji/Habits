// Pure habit logic: success rules, streaks, percentages, hh:mm time formatting, and stepped heatmap colors. No DOM access.
import {K,T,add,dateOf,mondayOf,esc} from './util.js';

export const isOff=(h,k)=>!!h.off&&h.off[k]!==undefined;

// ---- Time format (hh:mm) for minute habits ----
export const fmtHHMM=m=>{const t=Math.max(0,Math.round(Number(m)||0));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')};
export function parseHHMM(s){
  const t=String(s==null?'':s).trim();if(!t)return null;
  if(t.includes(':')){const parts=t.split(':');if(parts.length!==2)return null;
    const h=Number(parts[0]),m=Number(parts[1]);
    if(!Number.isFinite(h)||!Number.isFinite(m)||h<0||m<0)return null;
    return h*60+m}
  const n=Number(t);return Number.isFinite(n)&&n>=0?n:null}

// ---- Periodic habits (habits you do not do every day) ----
export const FQ_PER=['week','month','days'];
export function cleanFreq(f){
  if(!f||typeof f!=='object'||Array.isArray(f)||!FQ_PER.includes(f.per))return undefined;
  const n=Math.round(Number(f.n));if(!Number.isFinite(n)||n<1||n>(f.per==='days'?365:99))return undefined;
  return{n,per:f.per}}
export const isPeriodic=h=>!!h&&!h.stop&&!!cleanFreq(h.fq);
export const daily=hs=>hs.filter(h=>!isPeriodic(h));
export const periodic=hs=>hs.filter(isPeriodic);
export function freqText(h){const f=isPeriodic(h)?cleanFreq(h.fq):null;if(!f)return '';
  return f.per==='days'?(f.n===1?'every day':'every '+f.n+' days'):f.n+(f.n===1?' time':' times')+' / '+f.per}
export const isChecked=(h,k)=>!isOff(h,k)&&h.done[k]>0;
export const periodicChecked=(H,k)=>H.filter(h=>isPeriodic(h)&&h.created<=k&&isChecked(h,k));
export function periodsDay(H,k){const c=periodicChecked(H,k);if(!c.length)return null;
  let sw=0,sp=0;for(const h of c){const w=imp(h);sw+=w;sp+=w*Math.min(pctOf(h,h.done[k],k),CAP)}
  return{n:c.length,p:sw?sp/sw:0,list:c}}
export const countLabel=n=>n>9?'9+':String(n);

// ---- Goal history (the expected amount of each day) ----
export const usesGoalLog=h=>h.type!=='bool'&&h.type!=='text';
export const needsGoalLog=h=>usesGoalLog(h)&&!(h.gl&&Object.keys(h.gl).length);
export const goalHistory=h=>Object.keys(h.gl||{}).filter(d=>DK.test(d)&&h.gl[d]>0).sort().map(d=>[d,h.gl[d]]);
export function goalOn(h,k=K(T())){const hist=goalHistory(h);
  if(!hist.length)return h.goal;
  let g=hist[0][1];for(const [d,v] of hist){if(d<=k)g=v;else break}return g}
export function setGoal(h,goal,from=K(T())){const t=K(T());
  if(!(goal>0)||!DK.test(from))return false;
  if(from>t)from=t;
  h.gl=h.gl||{};
  if(!goalHistory(h).length&&h.goal>0)h.gl[h.created]=h.goal;
  h.gl[from]=goal;
  const hist=goalHistory(h),i=hist.findIndex(x=>x[0]===from);
  if(i>0&&hist[i-1][1]===goal)delete h.gl[from];
  h.goal=goalOn(h,t);return true}
export const goalVal=(h,k)=>h.type==='min'?fmtHHMM(goalOn(h,k)):goalOn(h,k)+(h.unit?' '+esc(h.unit):'');

// ---- Freeze ----
export const FZ='❄ Frozen',FZE='❄ Frozen (ended)';
export const isFrozen=(h,k)=>isOff(h,k)&&String(h.off[k]).startsWith('❄');
const frozenKeys=h=>Object.keys(h.off||{}).filter(k=>DK.test(k)&&String(h.off[k]).startsWith('❄')).sort();
export function freezeState(h){const ks=frozenKeys(h),t=K(T()),none={on:false,pending:false,since:null};
  if(!ks.length)return none;
  const L=ks[ks.length-1];if(h.off[L]!==FZ)return none;
  let i=ks.length-1;while(i>0&&h.off[ks[i-1]]!==FZE)i--;
  return{on:L<=t,pending:L>t,since:ks[i]}}
export const isFrozenNow=h=>freezeState(h).on;
export function freeze(h){const st=freezeState(h);if(st.on||st.pending)return null;
  const t=K(T()),start=isLogged(h,t)||isOff(h,t)?K(add(T(),1)):t;
  h.off=h.off||{};h.off[start]=FZ;return start}
export function unfreeze(h){const st=freezeState(h);if(!st.on&&!st.pending)return false;
  const t=K(T());
  for(const k of frozenKeys(h))if(k>=t)delete h.off[k];
  const ks=frozenKeys(h);if(ks.length&&h.off[ks[ks.length-1]]===FZ)h.off[ks[ks.length-1]]=FZE;
  return true}
export function unfreezeDay(h,k){if(!isFrozen(h,k))return false;
  const ks=frozenKeys(h),wasLast=k===ks[ks.length-1];
  delete h.off[k];
  if(wasLast){const n=frozenKeys(h);if(n.length&&h.off[n[n.length-1]]===FZ)h.off[n[n.length-1]]=FZE}
  return true}
export function extendFreeze(h){const ks=frozenKeys(h);if(!ks.length)return false;
  const L=ks[ks.length-1];if(h.off[L]!==FZ)return false;
  let changed=false;
  for(let d=add(dateOf(L),1);d<=T();d=add(d,1)){const k=K(d);if(h.off[k]===undefined){h.off[k]=FZ;changed=true}}
  return changed}

export function ok(h,k){const v=h.done[k]||0;
  if(h.type==='text'&&h.stop)return !isLogged(h,k);
  if(!h.stop)return v>0;
  return (v>0||!!(h.skip||{})[k]||k<K(T()))&&v<=(h.type==='bool'?0:2*goalOn(h,k))}
export function streak(h){let d=T(),n=0;const c=dateOf(h.created);if(!isOff(h,K(d))&&!ok(h,K(d)))d=add(d,-1);
  while(d>=c){const k=K(d);if(isOff(h,k)){d=add(d,-1);continue}if(!ok(h,k))break;n++;d=add(d,-1)}return n}
export function best(h){let b=0,run=0;for(let d=dateOf(h.created);d<=T();d=add(d,1)){const k=K(d);if(isOff(h,k))continue;if(ok(h,k)){run++;if(run>b)b=run}else run=0}return b}
export function count(h,from,to){let n=0;const c=dateOf(h.created);for(let d=from<c?c:from;d<=to;d=add(d,1)){const k=K(d);if(!isOff(h,k)&&ok(h,k))n++}return n}
export function todayOf(habits){const k=K(T()),act=daily(habits).filter(h=>!isOff(h,k));return{done:act.filter(h=>ok(h,k)).length,total:act.length}}
export function minutesToday(habits){const k=K(T());let m=0;
  for(const h of habits){if(h.stop||isOff(h,k)||isPeriodic(h))continue;const v=h.done[k]||0;if(h.type==='min')m+=v;else if(h.type==='hour')m+=v*60}
  return Math.round(m)}
export const minText=m=>fmtHHMM(m);
export function todayStats(habits){const k=K(T()),act=daily(habits).filter(h=>!isOff(h,k)),out=[];
  const mh=act.filter(h=>!h.stop&&(h.type==='min'||h.type==='hour'));
  if(mh.length)out.push(minText(minutesToday(mh)));
  const by=new Map();
  for(const h of act){if(h.stop||!SUMS.includes(h.type))continue;const u=sumUnit(h);by.set(u,(by.get(u)||0)+(h.done[k]||0))}
  for(const [u,n] of by)out.push(Math.round(n*10)/10+' '+esc(u));
  const bh=act.filter(h=>!h.stop&&h.type==='bool');
  if(bh.length)out.push(bh.filter(h=>h.done[k]>0).length+' done');
  const sh=act.filter(h=>h.stop&&h.type!=='text');
  if(sh.length)out.push(sh.filter(h=>isLogged(h,k)&&pctOf(h,h.done[k]||0,k)>=1).length+' stopped');
  return out}

export const TYPES={min:{unit:'min',goal:30,stop:60},hour:{unit:'hr',goal:1,stop:2},pages:{unit:'pages',goal:10,stop:30},problems:{unit:'problems solved',goal:3},times:{unit:'times',goal:1},num:{unit:'',goal:10,stop:30},text:{unit:'%',goal:100},bool:{unit:''}};
export const SUMS=['pages','problems','times','num'];
export const sumUnit=h=>h.unit||(h.type==='num'?'units':h.type);
export function unitType(t){const u=String(t||'').trim().slice(0,24);
  if(/^(m|min|mins|minute|minutes|hh:mm|time)$/i.test(u))return{type:'min',unit:'min'};
  if(/^(h|hr|hrs|hour|hours)$/i.test(u))return{type:'hour',unit:'hr'};
  return{type:'num',unit:u}}
const ordOf=h=>Number.isFinite(h.ord)?h.ord:1e9;
export const sortByOrder=hs=>[...hs].sort((a,b)=>ordOf(a)-ordOf(b));
export function setOrder(habits,ids){ids.forEach((id,i)=>{const h=habits.find(x=>x.id===id);if(h&&h.ord!==i)h.ord=i})}
export const txtAmt=(h,v)=>h.type==='bool'?(h.stop?(v>0?'Slipped':'Avoided it'):(v>0?'Done':'Not done')):h.type==='text'?(h.stop?'Slipped':'Logged'):h.type==='min'?fmtHHMM(v):`${v} ${esc(h.unit)}`.trim();
export const typeLabel=h=>({min:'Time (hh:mm)',hour:'Hours',pages:h.unit==='chapters'?'Chapters':'Pages',problems:'Problems',times:'Number of times',num:h.unit?'Number · '+esc(h.unit):'Number',text:'Text with a score',bool:'True / false'})[h.type]+(h.stop?(h.type==='text'?' · Stop habit (write when you slip)':h.type==='bool'?' · Stop habit (avoid it)':' · Stop habit (less is better)'):'');
export function periods(){const t=T();const wk=mondayOf(t);const mo=new Date(t.getFullYear(),t.getMonth(),1);
  return{t,wk,mo,wkDays:Math.round((t-wk)/864e5)+1,moDays:t.getDate(),moTotal:new Date(t.getFullYear(),t.getMonth()+1,0).getDate()}}

export const imp=h=>{const n=Number(h&&h.importance);return n>=1&&n<=5?n:3};
export const isLogged=(h,k)=>h.done[k]>0||!!(h.skip||{})[k];
export function pctOf(h,v,k=K(T())){
  if(h.type==='text')return v/100;
  if(h.type==='bool')return (h.stop?!(v>0):v>0)?1:0;
  const r=v/goalOn(h,k);
  return h.stop?(r<=1?1:Math.max(0,2-r)):r}
export const CAP=2;
export function dayPercent(H,k,isToday){let sw=0,sp=0,any=false;
  for(const h of H){if(h.created>k||isOff(h,k)||isPeriodic(h))continue;
    let p;
    if(isLogged(h,k)){any=true;p=pctOf(h,h.done[k]||0,k)}
    else if(isToday||h.stop)continue;
    else p=0;
    const w=imp(h);sw+=w;sp+=w*Math.min(p,CAP)}
  return any&&sw?sp/sw:null}
export const pctText=p=>Math.round(p*100)+'%';
export const amtPct=(h,v,k=K(T()))=>h.type==='bool'?'':h.type==='text'?pctText(v/100)+' score':pctText(v/goalOn(h,k))+(h.stop?' of limit':' of goal');
export const amtFull=(h,v,k=K(T()))=>h.type==='bool'||h.type==='text'?amtPct(h,v,k):amtPct(h,v,k)+' ('+goalVal(h,k)+')';
export const logPct=(h,v,k)=>h.type==='text'?pctText(v/100):amtPct(h,v,k);
export const SHORT=[0,.5,1,1.5,2];
export const shortAmt=(h,m,k=K(T()))=>Math.round(m*goalOn(h,k)*10)/10;

// Smooth darkening green scale (both light & dark mode):
// 0% = red (gz), >0% -> 100% = pale green (--g0) -> dark green (--g1), 100% -> 200% = dark green (--g1) -> deep forest (--g2).
// Above 200% (single habit only): stays deep forest + glow (gl), shimmer at 500%+ (gs).
export function paint(p,glow=false){
  if(!(p>0))return{cls:'gc gz',style:''};
  const s=Math.min(p,CAP);let a='--g0',b='--g1',f=s;
  if(s>1){a='--g1';b='--g2';f=s-1}
  let cls='gc',style=`--ga:var(${a});--gb:var(${b});--f:${(f*100).toFixed(1)}%`;
  if(glow&&p>CAP){const w=Math.min(1,(p-CAP)/3);cls+=' gl'+(p>=5?' gs':'');style+=`;--w:${w.toFixed(2)}`}
  return{cls,style}}

export function setAmt(h,k,v){h.skip=h.skip||{};
  if(v===null||v===undefined){delete h.done[k];delete h.skip[k];return}
  v=Math.max(0,Number(v)||0);
  if(v>0){h.done[k]=v;delete h.skip[k]}else{delete h.done[k];h.skip[k]=1}
  if(k<h.created)h.created=k}
export function norm(h){if(!h.goal){h.goal=30;h.unit='min';for(const k in h.done)h.done[k]=30}
  h.type=h.type||'min';h.stop=!!h.stop;h.unit=h.type==='bool'?'':h.type==='text'?'%':h.type==='num'?(h.unit||''):(h.unit||'min');if(h.type==='text')h.goal=100;h.notes=h.notes||{};h.skip=h.skip||{};h.off=h.off||{};h.sum=h.sum||{};h.nts=h.nts||{};h.importance=imp(h);if(!h.created)h.created=Object.keys(h.done).sort()[0]||K(T());
  h.gl=h.gl&&typeof h.gl==='object'&&!Array.isArray(h.gl)?h.gl:{};
  if(needsGoalLog(h)&&h.goal>0)h.gl[h.created]=h.goal;
  if(h.fq!==undefined){const f=h.stop?undefined:cleanFreq(h.fq);if(f)h.fq=f;else delete h.fq}
  upgradeNotes(h)}
export const span=(h,from)=>{const c=dateOf(h.created),f=c>from?c:from;let n=0;for(let d=f;d<=T();d=add(d,1))if(!isOff(h,K(d)))n++;return Math.max(1,n)};
export const sumAmt=(h,from,to)=>{let n=0;for(let d=from;d<=to;d=add(d,1))n+=h.done[K(d)]||0;return Math.round(n*10)/10};

// ---- "What did you do?" and notes ----
export const noteKey=(k,id)=>k+'_'+id;
export const sumOf=(h,k)=>(h.sum&&typeof h.sum[k]==='string'?h.sum[k]:'');
const noteByTime=(a,b)=>a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0);
export function dayNotes(h,k){const out=[],n=h.nts||{};
  for(const key in n){if(key.length<12||key[10]!=='_'||key.slice(0,10)!==k)continue;const v=n[key];if(!v||typeof v!=='object')continue;
    out.push({id:key.slice(11),t:typeof v.t==='string'?v.t:'',at:Number(v.at)||0,o:Number.isFinite(v.o)?v.o:undefined})}
  return out.sort((a,b)=>((a.o===undefined)-(b.o===undefined))||(a.o-b.o)||noteByTime(a,b))}
export const isManual=(h,k)=>dayNotes(h,k).some(x=>x.o!==undefined);
export function addNote(h,k){h.nts=h.nts||{};
  const id='n'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),cur=dayNotes(h,k),v={t:'',at:Date.now()};
  if(cur.some(x=>x.o!==undefined))v.o=Math.max(...cur.map(x=>x.o===undefined?-1:x.o))+1;
  h.nts[noteKey(k,id)]=v;return id}
export function setNote(h,k,id,t){const key=noteKey(k,id);if(h.nts&&h.nts[key]&&h.nts[key].t!==t)h.nts[key]={...h.nts[key],t}}
export function delNote(h,k,id){if(h.nts)delete h.nts[noteKey(k,id)]}
export function moveNote(h,k,id,dir){const ids=dayNotes(h,k).map(x=>x.id),i=ids.indexOf(id),j=i+dir;
  if(i<0||j<0||j>=ids.length)return false;
  [ids[i],ids[j]]=[ids[j],ids[i]];
  ids.forEach((x,n)=>{const key=noteKey(k,x);if(h.nts[key].o!==n)h.nts[key]={...h.nts[key],o:n}});return true}
export function resetNoteOrder(h,k){for(const x of dayNotes(h,k)){const key=noteKey(k,x.id);if(h.nts[key].o!==undefined){const {o,...rest}=h.nts[key];h.nts[key]=rest}}}
export function pruneEmpty(h,keep){for(const key in h.nts||{}){const v=h.nts[key];if(key.slice(0,10)!==keep&&!(v&&typeof v.t==='string'&&v.t.trim()))delete h.nts[key]}}
export function textDays(h){const s=new Set();
  for(const k in h.sum||{})if(h.sum[k])s.add(k);
  for(const key in h.nts||{}){const v=h.nts[key];if(v&&typeof v.t==='string'&&v.t.trim())s.add(key.slice(0,10))}
  for(const k in h.notes||{})if(h.notes[k])s.add(k);
  return s}
export function upgradeNotes(h){h.nts=h.nts||{};
  for(const k of Object.keys(h.notes||{})){const t=h.notes[k],key=noteKey(k,'old');
    if(typeof t==='string'&&t.trim()&&DK.test(k)&&!h.nts[key])h.nts[key]={t,at:0};
    delete h.notes[k]}}

export const DK=/^\d{4}-\d{2}-\d{2}$/;
export function cleanHabit(h){
  if(!h||typeof h!=='object'||typeof h.id!=='string'||!/^[\w-]{1,40}$/.test(h.id)||typeof h.name!=='string')return null;
  const type=Object.hasOwn(TYPES,h.type)?h.type:'min';
  const pick=(o,f)=>{const r={};if(o&&typeof o==='object')for(const k in o)if(DK.test(k)){const v=f(o[k]);if(v!==undefined)r[k]=v}return r};
  const num=v=>Number.isFinite(+v)&&+v>0?+v:undefined;
  return {id:h.id,name:h.name.slice(0,60),cat:typeof h.cat==='string'&&/^[\w-]{1,40}$/.test(h.cat)?h.cat:undefined,grp:typeof h.grp==='string'&&/^[\w-]{1,40}$/.test(h.grp)?h.grp:undefined,type,stop:!!h.stop,goal:type==='text'?100:num(h.goal)||(type==='bool'?1:30),unit:type==='text'?'%':String(h.unit||'').slice(0,24),ord:typeof h.ord==='number'&&Number.isFinite(h.ord)?h.ord:undefined,
    desc:typeof h.desc==='string'?h.desc:undefined,archived:h.archived?true:undefined,importance:imp(h),created:DK.test(h.created)?h.created:K(T()),
    done:pick(h.done,num),skip:pick(h.skip,v=>v?1:undefined),off:pick(h.off,v=>String(v).slice(0,40)),
    notes:pick(h.notes,v=>typeof v==='string'&&v?v:undefined),
    sum:pick(h.sum,v=>typeof v==='string'&&v.trim()?v:undefined),nts:pickNotes(h.nts),
    gl:type==='bool'||type==='text'?{}:pick(h.gl,num),
    fq:h.stop?undefined:cleanFreq(h.fq)}}
const NKEY=/^\d{4}-\d{2}-\d{2}_[\w-]{1,24}$/;
function pickNotes(o){const r={};
  if(o&&typeof o==='object')for(const k in o){const v=o[k];if(!NKEY.test(k)||!v||typeof v!=='object'||typeof v.t!=='string'||!v.t.trim())continue;
    const n={t:v.t,at:Number.isFinite(+v.at)&&+v.at>=0?+v.at:0};if(Number.isFinite(v.o))n.o=v.o;r[k]=n}
  return r}
