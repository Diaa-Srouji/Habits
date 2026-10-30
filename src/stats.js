// Pure statistics for the Habit page and the Category page (all time, and for a date range the user picks). No DOM access.
// Every habit gets only the numbers that make sense for its type:
//   amount  (minutes, hours, pages, chapters, problems, times): percentage thresholds, total, average, best day
//   bool    (done / not done): days done, days missed, done rate
//   stop    (less is better, with a limit): days stopped, days over the limit, total used, saved against the limit
//   stopbool(avoid it / slipped; also a stop-text slip log: no entry = clean day, an entry = slip): days stopped, days slipped, stop rate
//   text    (a short text + the person's own percentage): percentage thresholds, average, best day
//   periodic (a habit with a frequency label, see isPeriodic): only CHECKED days (something above 0 logged) are counted. Unchecked days are never a miss,
//     so there are no missed days, no 0% days, no miss rate and no streak. Rows: amount = checked, above 0%, >= 50 / 100 / 200%, total, average, best;
//     bool = days done; text = logged, above 0%, >= 50 / 100%, average, best.
// Every day is measured against the goal (or limit) that day had (goalOn), so changing a goal later never changes the numbers of earlier days.
// A category mixes types, so its day counts use the combined weighted percentage of each day (the same number the heatmap colours) and
// its totals are listed per kind, like the Home buttons do.
import {K,T,add,dateOf,esc} from './util.js';
import {isOff,isFrozen,isLogged,pctOf,ok,minText,dayPercent,goalOn,DK,SUMS,sumUnit,isPeriodic,isChecked,daily,periodic} from './scoring.js';

const EPS=1e-9;
const f1=n=>Math.round(n*10)/10;
const plural=(n,w)=>n+' '+w+(n===1?'':'s');

// ---- Ranges ----
// The earliest start of some habits (today when there are none)
export const startOf=hs=>hs.length?hs.reduce((m,h)=>h.created<m?h.created:m,hs[0].created):K(T());
// The same day one month earlier. A day that does not exist there (31 March) becomes the last day of that month (28 or 29 February).
export function monthBack(d){const y=d.getFullYear(),m=d.getMonth()-1,last=new Date(y,m+1,0).getDate();return new Date(y,m,Math.min(d.getDate(),last))}
// The range shown first: one month back, or the start of the habit / category if that is less than a month ago. It ends today.
export function rangeDefault(startKey,today=T()){const mb=K(monthBack(today));return{from:startKey>mb?startKey:mb,to:K(today)}}
// '' when the range can be used, otherwise a short message for the person
export function checkRange(from,to){
  if(!DK.test(from||'')||!DK.test(to||''))return 'Choose both dates.';
  if(from>to)return 'The start date is after the end date.';
  if(from>K(T()))return 'The start date is in the future.';
  return ''}
// Days before the habit existed and days in the future are never counted
function clamp(created,from,to){const t=T(),c=dateOf(created),a=dateOf(from),b=dateOf(to);return[a<c?c:a,b>t?t:b]}

// ---- One habit ----
// Returns plain counts. A frozen day is only counted as frozen. A skipped day counts in "days" and "skipped" and nowhere else.
// Today is left out of the percentage counts until it is logged (the day is not over). For stop habits, a past day that was not logged
// counts as stopped, the same rule the streak already uses.
export function habitStats(h,from,to){
  if(isPeriodic(h))return periodicStats(h,from,to);
  const tk=K(T()),[a,b]=clamp(h.created,from,to);
  const r={kind:h.type==='text'?(h.stop?'stopbool':'text'):h.stop?(h.type==='bool'?'stopbool':'stop'):h.type==='bool'?'bool':'amount',
    days:0,frozen:0,skipped:0,logged:0,counted:0,zero:0,pos:0,p50:0,p100:0,p200:0,done:0,missed:0,stopped:0,over:0,atZero:0,sum:0,best:0,saved:0,streak:0};
  let run=0;
  for(let d=a;d<=b;d=add(d,1)){const k=K(d);
    if(isFrozen(h,k)){r.frozen++;continue}
    if(isOff(h,k)){r.skipped++;r.days++;continue}
    r.days++;
    const v=h.done[k]||0,logged=isLogged(h,k),pending=k===tk&&!logged;
    if(logged)r.logged++;
    if(ok(h,k)){run++;if(run>r.streak)r.streak=run}else run=0;
    if(pending)continue;
    r.counted++;
    if(h.type==='text'&&h.stop){if(logged)r.over++;else r.stopped++}
    else if(h.stop){const p=pctOf(h,v,k);
      if(p>=1-EPS)r.stopped++;else r.over++;
      if(h.type!=='bool'){if(p<=EPS)r.atZero++;r.sum+=v;r.saved+=Math.max(0,goalOn(h,k)-v)}}   // each day against the limit it had that day
    else if(h.type==='bool'){if(v>0)r.done++;else r.missed++}
    else if(v>0){const p=pctOf(h,v,k);r.pos++;r.sum+=v;if(v>r.best)r.best=v;
      if(p>=.5-EPS)r.p50++;if(p>=1-EPS)r.p100++;if(p>=2-EPS)r.p200++}
    else r.zero++}
  return r}

// Periodic habits: the frequency is only a label. Total / frozen / skipped days are counted as for any habit; everything else counts CHECKED days only
// (a checked day = something above 0 logged). r.logged = checked days, r.pos = the same, r.done = checked days of a True / false habit.
function periodicStats(h,from,to){
  const [a,b]=clamp(h.created,from,to);
  const r={kind:h.type==='bool'?'pbool':h.type==='text'?'ptext':'pnum',
    days:0,frozen:0,skipped:0,logged:0,counted:0,zero:0,pos:0,p50:0,p100:0,p200:0,done:0,missed:0,stopped:0,over:0,atZero:0,sum:0,best:0,saved:0,streak:0};
  for(let d=a;d<=b;d=add(d,1)){const k=K(d);
    if(isFrozen(h,k)){r.frozen++;continue}
    if(isOff(h,k)){r.skipped++;r.days++;continue}
    r.days++;
    if(!isChecked(h,k))continue;
    const v=h.done[k];r.logged++;r.counted++;
    if(h.type==='bool'){r.done++;continue}
    const p=pctOf(h,v,k);r.pos++;r.sum+=v;if(v>r.best)r.best=v;
    if(p>=.5-EPS)r.p50++;if(p>=1-EPS)r.p100++;if(p>=2-EPS)r.p200++}
  return r}

// An amount in the habit's own unit (minutes and hours read as "1 h 35 min")
export function amt(h,n){
  if(h.type==='min')return minText(Math.round(n));
  if(h.type==='hour')return minText(Math.round(n*60));
  return f1(n)+(h.unit?' '+esc(h.unit):'')}
const rate=(a,b)=>a+b?Math.round(a/(a+b)*100)+'%':'–';

// Tiles for one habit: [label, value, optional class]. Values are already safe to put in HTML.
export function habitRows(h,r){
  const rows=[['Total days',r.days],['Frozen days',r.frozen,'ice'],['Skipped days',r.skipped]],streak=['Longest streak',plural(r.streak,'day')];
  if(r.kind==='pbool')return rows.concat([['Days done',r.done]]);
  if(r.kind==='ptext')return rows.concat([['Days logged',r.logged],['Days above 0%',r.pos],['Days ≥ 50%',r.p50],['Days ≥ 100%',r.p100],
    ['Average per logged day',r.pos?Math.round(r.sum/r.pos)+'%':'–'],['Best day',r.pos?Math.round(r.best)+'%':'–']]);
  if(r.kind==='pnum')return rows.concat([['Days checked',r.logged],['Days above 0%',r.pos],['Days ≥ 50%',r.p50],['Days ≥ 100%',r.p100],['Days ≥ 200%',r.p200],
    ['Total',amt(h,r.sum)],['Average per checked day',r.pos?amt(h,r.sum/r.pos):'–'],['Best day',r.pos?amt(h,r.best):'–']]);
  if(h.type==='text'&&h.stop)rows.push(['Days logged',r.logged],['Days clean',r.stopped],['Days slipped',r.over],['Clean rate',rate(r.stopped,r.over)],streak);
  else if(r.kind==='text')rows.push(['Days logged',r.logged],['Days at 0%',r.zero],['Days above 0%',r.pos],['Days ≥ 50%',r.p50],['Days ≥ 100%',r.p100],['Days ≥ 200%',r.p200],
    ['Average per logged day',r.pos?Math.round(r.sum/r.pos)+'%':'–'],['Best day',r.pos?Math.round(r.best)+'%':'–'],streak);
  else if(r.kind==='bool')rows.push(['Days done',r.done],['Days missed',r.missed],['Done rate',rate(r.done,r.missed)],streak);
  else if(r.kind==='stopbool')rows.push(['Days logged',r.logged],['Days stopped',r.stopped],['Days slipped',r.over],['Stop rate',rate(r.stopped,r.over)],streak);
  else if(r.kind==='stop')rows.push(['Days logged',r.logged],['Days stopped',r.stopped],['Days over the limit',r.over],['Days at 0%',r.atZero],
    ['Total used',amt(h,r.sum)],['Average per day',r.counted?amt(h,r.sum/r.counted):'–'],['Saved against the limit',amt(h,r.saved)],streak);
  else rows.push(['Days checked',r.logged],['Days at 0%',r.zero],['Days above 0%',r.pos],['Days ≥ 50%',r.p50],['Days ≥ 100%',r.p100],['Days ≥ 200%',r.p200],
    ['Total',amt(h,r.sum)],['Average per checked day',r.pos?amt(h,r.sum/r.pos):'–'],['Best day',r.pos?amt(h,r.best):'–'],streak);
  return rows}

// ---- One category ----
// The totals line of a category: one entry for each KIND of habit it has, the same kinds and order as the Home buttons (todayStats).
// pairs = [[habit, habitStats], ...]
export function totalsOf(pairs){const out=[];
  const mh=pairs.filter(([h])=>!h.stop&&(h.type==='min'||h.type==='hour'));
  if(mh.length)out.push(minText(Math.round(mh.reduce((m,[h,r])=>m+(h.type==='hour'?r.sum*60:r.sum),0))));
  const by=new Map();
  for(const [h,r] of pairs){if(h.stop||!SUMS.includes(h.type))continue;const u=sumUnit(h);by.set(u,(by.get(u)||0)+r.sum)}
  for(const [u,n] of by)out.push(f1(n)+' '+esc(u));
  const bh=pairs.filter(([h])=>!h.stop&&h.type==='bool');
  if(bh.length)out.push(bh.reduce((n,[,r])=>n+r.done,0)+' done');
  const sh=pairs.filter(([h])=>h.stop&&h.type!=='text');
  if(sh.length)out.push(sh.reduce((n,[,r])=>n+r.stopped,0)+' stopped');
  return out}

// Day counts come from each day's combined percentage (dayPercent, the heatmap's number). A day when every habit is frozen is a frozen day;
// a day when every habit is paused but not all frozen is a skipped day. Neither is counted in the percentages.
// A past day with nothing logged counts as 0%, unless the category only has stop habits (an unlogged stop habit is a success, not a miss).
export function categoryStats(all,from,to){
  const tk=K(T()),[a,b]=clamp(startOf(all),from,to),hs=daily(all);   // periodic habits never change the daily numbers
  const r={days:0,frozen:0,skipped:0,logged:0,zero:0,pos:0,p50:0,p100:0,p200:0,frozenHabitDays:0,totals:[],hasPeriodic:false,periodicChecks:0};
  if(hs.length)for(let d=a;d<=b;d=add(d,1)){const k=K(d),ex=hs.filter(h=>h.created<=k);
    if(!ex.length)continue;
    if(ex.every(h=>isFrozen(h,k))){r.frozen++;continue}
    r.days++;
    if(ex.every(h=>isOff(h,k))){r.skipped++;continue}
    const p=dayPercent(hs,k,k===tk);
    if(p===null){if(k!==tk&&ex.some(h=>!isOff(h,k)&&!h.stop))r.zero++;continue}
    r.logged++;
    if(p<=EPS)r.zero++;
    else{r.pos++;if(p>=.5-EPS)r.p50++;if(p>=1-EPS)r.p100++;if(p>=2-EPS)r.p200++}}
  const pairs=hs.map(h=>[h,habitStats(h,from,to)]);
  r.frozenHabitDays=pairs.reduce((n,[,s])=>n+s.frozen,0);
  r.totals=totalsOf(pairs);
  const ph=periodic(all);r.hasPeriodic=ph.length>0;
  r.periodicChecks=ph.reduce((n,h)=>n+periodicStats(h,from,to).logged,0);   // checked days of its periodic habits (one per habit and day)
  return r}

export function categoryRows(r){
  const rows=[['Total days',r.days],['Frozen days',r.frozen,'ice']];
  if(r.frozenHabitDays)rows.push(['Frozen habit-days',r.frozenHabitDays,'ice']);
  rows.push(['Skipped days',r.skipped],['Days checked',r.logged],['Days at 0%',r.zero],['Days above 0%',r.pos],['Days ≥ 50%',r.p50],['Days ≥ 100%',r.p100],['Days ≥ 200%',r.p200],
    ...(r.hasPeriodic?[['Periodic checks',r.periodicChecks]]:[]),
    ['Totals',r.totals.length?r.totals.join(' · '):'–','wide']);
  return rows}
