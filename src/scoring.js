// Pure habit logic: success rules, streaks, levels, scores and colours. No DOM access (except the palette default).
import {K,T,add,dateOf,mondayOf,esc} from './util.js';

export const isOff=(h,k)=>!!h.off&&h.off[k]!==undefined;
// A day is a success: regular habits = something logged, stop habits = at or under the limit (unlogged past days count as 0)
export function ok(h,k){const v=h.done[k]||0;
  if(!h.stop)return v>0;
  return (v>0||!!(h.skip||{})[k]||k<K(T()))&&v<=(h.type==='bool'?0:h.goal)}
export function streak(h){let d=T(),n=0;const c=dateOf(h.created);if(!isOff(h,K(d))&&!ok(h,K(d)))d=add(d,-1);
  while(d>=c){const k=K(d);if(isOff(h,k)){d=add(d,-1);continue}if(!ok(h,k))break;n++;d=add(d,-1)}return n}
export function best(h){let b=0,run=0;for(let d=dateOf(h.created);d<=T();d=add(d,1)){const k=K(d);if(isOff(h,k))continue;if(ok(h,k)){run++;if(run>b)b=run}else run=0}return b}
export function count(h,from,to){let n=0;const c=dateOf(h.created);for(let d=from<c?c:from;d<=to;d=add(d,1)){const k=K(d);if(!isOff(h,k)&&ok(h,k))n++}return n}
// Today's progress for a set of habits: how many active (not skipped) habits are done today
export function todayOf(habits){const k=K(T()),act=habits.filter(h=>!isOff(h,k));return{done:act.filter(h=>ok(h,k)).length,total:act.length}}
export const TYPES={min:{unit:'min',goal:30,stop:60},hour:{unit:'hr',goal:1,stop:2},pages:{unit:'pages',goal:10,stop:30},problems:{unit:'problems solved',goal:3},times:{unit:'times',goal:1},bool:{unit:''}};
export const txtAmt=(h,v)=>h.type==='bool'?(h.stop?(v>0?'Slipped':'Avoided it'):(v>0?'Done':'Not done')):`${v} ${esc(h.unit)}`;
export const typeLabel=h=>({min:'Minutes',hour:'Hours',pages:h.unit==='chapters'?'Chapters':'Pages',problems:'Problems',times:'Number of times',bool:'True / false'})[h.type]+(h.stop?' · Stop habit (less is better)':'');
export function periods(){const t=T();const wk=mondayOf(t);const mo=new Date(t.getFullYear(),t.getMonth(),1);
  return{t,wk,mo,wkDays:Math.round((t-wk)/864e5)+1,moDays:t.getDate(),moTotal:new Date(t.getFullYear(),t.getMonth()+1,0).getDate()}}
export const LN=['None','Lowest','Low','Normal','Better','Best'];
// Levels are relative to the daily goal: Lowest <50%, Low 50%+, Normal 100%+, Better 150%+, Best 200%+
export const levelOf=(h,v)=>{
  if(h.type==='bool')return h.stop?(v>0?0:5):(v>0?5:0);
  const r=v/h.goal;
  if(h.stop)return r<=0?5:r<=.5?4:r<=1?3:r<=1.5?2:r<=2?1:0;
  return !(v>0)?0:r>=2?5:r>=1.5?4:r>=1?3:r>=.5?2:1};
export const levelAmt=(h,n)=>Math.round((h.stop?[2.5,2,1.5,1,.25,0][n]:[0,.25,.5,1,1.5,2][n])*h.goal*10)/10;
// v: number>0 = amount, 0 = deliberately skipped, null = back to not logged
export function setAmt(h,k,v){h.skip=h.skip||{};
  if(v===null||v===undefined){delete h.done[k];delete h.skip[k];return}
  v=Math.max(0,Number(v)||0);
  if(v>0){h.done[k]=v;delete h.skip[k]}else{delete h.done[k];h.skip[k]=1}
  if(k<h.created)h.created=k}
export function norm(h){if(!h.goal){h.goal=30;h.unit='min';for(const k in h.done)h.done[k]=30}
  h.type=h.type||'min';h.stop=!!h.stop;h.unit=h.type==='bool'?'':(h.unit||'min');h.notes=h.notes||{};h.skip=h.skip||{};h.off=h.off||{};if(!h.created)h.created=Object.keys(h.done).sort()[0]||K(T())}
export const span=(h,from)=>{const c=dateOf(h.created),f=c>from?c:from;let n=0;for(let d=f;d<=T();d=add(d,1))if(!isOff(h,K(d)))n++;return Math.max(1,n)};
export const sumAmt=(h,from,to)=>{let n=0;for(let d=from;d<=to;d=add(d,1))n+=h.done[K(d)]||0;return Math.round(n*10)/10};
// Shade inside a level: 15 min and 20 min share a level color but 20 min is slightly stronger
export const levelFrac=(h,v)=>{if(h.type==='bool')return 1;const r=v/h.goal;
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
// Default palette: red -> yellow -> green, changing smoothly with the amount
const RG=[[0,'#A50026'],[.2,'#F46D43'],[.4,'#FEE08B'],[.6,'#A6D96A'],[.8,'#1A9850'],[1,'#006837']].map(([p,c])=>[p,[1,3,5].map(i=>parseInt(c.slice(i,i+2),16))]);
function rgColor(s){s=Math.max(0,Math.min(1,s));let i=1;while(i<RG.length-1&&s>RG[i][0])i++;
  const [p0,a]=RG[i-1],[p1,b]=RG[i],f=(s-p0)/(p1-p0);return 'rgb('+a.map((x,j)=>Math.round(x+(b[j]-x)*f)).join(',')+')'}
export const scoreColor=(s,p=document.documentElement.dataset.palette)=>p==='github'?ghColor(s):p==='cool'?gradColor(s):rgColor(s);
// 0..1 score of a day: regular = more is better (goal reached is about 0.57), stop = less is better
export const dayScore=(h,v)=>{if(h.type==='bool')return (h.stop?v<=0:v>0)?.9:0;
  const r=Math.min(1,v/(2*h.goal));return h.stop?1-r:(v>0?.15+.85*r:0)};

// Cleans a habit coming from an imported file so it cannot break (or inject into) the page.
export const DK=/^\d{4}-\d{2}-\d{2}$/;
export function cleanHabit(h){
  if(!h||typeof h!=='object'||typeof h.id!=='string'||!/^[\w-]{1,40}$/.test(h.id)||typeof h.name!=='string')return null;
  const type=Object.hasOwn(TYPES,h.type)?h.type:'min';
  const pick=(o,f)=>{const r={};if(o&&typeof o==='object')for(const k in o)if(DK.test(k)){const v=f(o[k]);if(v!==undefined)r[k]=v}return r};
  const num=v=>Number.isFinite(+v)&&+v>0?+v:undefined;
  return {id:h.id,name:h.name.slice(0,60),cat:typeof h.cat==='string'&&/^[\w-]{1,40}$/.test(h.cat)?h.cat:undefined,type,stop:!!h.stop,goal:num(h.goal)||(type==='bool'?1:30),unit:String(h.unit||'').slice(0,24),
    desc:typeof h.desc==='string'?h.desc:undefined,archived:h.archived?true:undefined,created:DK.test(h.created)?h.created:K(T()),
    done:pick(h.done,num),skip:pick(h.skip,v=>v?1:undefined),off:pick(h.off,v=>String(v).slice(0,40)),
    notes:pick(h.notes,v=>typeof v==='string'&&v?v:undefined)}}
