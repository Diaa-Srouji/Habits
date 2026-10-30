// The Day page (#/d/<yyyy-mm-dd>): everything you did on one day, across all habits, grouped by category.
// It only reads the data that is already loaded (percentage, colour, amount, "What did you do?" and notes); it changes nothing.
import {S} from './state.js';
import {$,K,T,add,dateOf,esc} from './util.js';
import {DK,isOff,isFrozen,isLogged,pctOf,dayPercent,paint,pctText,amtFull,txtAmt,sumOf,dayNotes,imp,sortByOrder,isPeriodic,isChecked,daily,periodic} from './scoring.js';
import {live,inCat} from './categories.js';
import {href} from './router.js';

const IMPS=['Minor','Low','Normal','High','Critical'];
const longDate=d=>d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
// the coloured square: same green scale as the heatmaps (glow above 200%, since each card is one habit on its own)
const sq=(cls='',style='')=>`<i class="dsw${cls?' '+cls:''}"${style?` style="${style}"`:''} aria-hidden="true"></i>`;

// One habit on this day: colour square, name, amount and percentage, its summary, its notes, and a way to edit that day.
function card(h,k,today){
  const off=isOff(h,k),lg=!off&&isLogged(h,k),v=h.done[k]||0;
  let square,stat,pc='<span class="dpct dnone">–</span>',cls='';
  if(isFrozen(h,k)){square='<i class="dsw dic" aria-hidden="true"></i>';cls=' off';
    stat='<span class="dbadge dfz">❄ Frozen</span> paused, not counted'}
  else if(off){square='<i class="dsw dsk" aria-hidden="true"></i>';cls=' off';
    stat=`<span class="dbadge">Skipped</span> ${esc(h.off[k]||'no reason')}`}
  else if(lg){const p=pctOf(h,v,k),g=paint(p,true);square=sq(g.cls,g.style);
    stat=`<b>${txtAmt(h,v)}</b>${h.type==='bool'?'':' · '+amtFull(h,v,k)}`;   // e.g. 17 min · 113% of goal (15 min): the goal of that day
    pc=`<span class="dpct">${pctText(p)}</span>`}
  else{square=sq();cls=' none';
    stat=today?'Not logged yet':h.stop&&h.type==='text'?'No entry · clean day':'Not logged'+(!h.stop?' · counts as 0%':'')}
  const sm=sumOf(h,k),ns=dayNotes(h,k).filter(n=>n.t.trim());
  const notes=ns.length?`<ul class="dnotes" aria-label="Notes">${ns.map(n=>{const at=n.at?new Date(n.at):null;
    return `<li>${at?`<span class="ntat">${esc(at.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span> `:''}${esc(n.t)}</li>`}).join('')}</ul>`:'';
  return `<article class="dcard${cls}">${square}
    <div class="dmain">
      <div class="dtop"><a class="name nm" href="${href.habit(h.id)}">${esc(h.name)}</a>${isPeriodic(h)?'<span class="dbadge dper">periodic</span>':''}${pc}</div>
      <div class="dstat">${stat}<span class="dimp"> · Importance ${imp(h)} (${IMPS[imp(h)-1]})</span></div>
      ${sm?`<div class="dsum"><span class="sumlbl">${h.type==='text'?'Text':'What did you do?'}</span> ${esc(sm)}</div>`:''}
      ${notes}
      <div class="dact"><button class="rm" data-editday="${h.id}|${k}">Edit this day</button></div>
    </div></article>`}

// One category: its name and colour, how many of its habits were logged, its combined percentage, then its habits.
function group(c,k,today){
  // daily habits as always, plus the periodic habits that were checked that day (an unchecked periodic habit is never listed)
  const hs=sortByOrder(inCat(S.habits,c.id)).filter(h=>h.created<=k&&(!isPeriodic(h)||isChecked(h,k)));   // the order set by dragging on the Category page
  if(!hs.length)return '';
  const dh=daily(hs),pn=hs.length-dh.length,p=dayPercent(dh,k,today),act=dh.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length;
  const sub=[act.length?`${logged} of ${act.length} logged${p===null?'':' · '+pctText(p)}`:'',pn?`${pn} periodic checked`:''].filter(Boolean).join(' · ');
  return `<section class="dgrp" style="--c:${c.color}" aria-labelledby="dg-${c.id}">
    <div class="dgh"><h3 id="dg-${c.id}"><span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>${esc(c.name)}</h3>
      <span class="dgs">${sub}</span></div>
    <div class="dcards">${hs.map(h=>card(h,k,today)).join('')}</div></section>`}

// Returns false when the address holds a date that does not exist (the caller shows "Day not found").
export function renderDay(k){
  if(!DK.test(k)||K(dateOf(k))!==k)return false;
  const t=T(),tk=K(t),d=dateOf(k),today=k===tk,future=k>tk;
  const prev=K(add(d,-1)),next=K(add(d,1));
  document.title=longDate(d)+' · Habit tracker';
  const nav=`<div class="daynav"><a class="btn alt sv" href="${href.day(prev)}" rel="prev">← Previous day</a>
    <input type="date" id="dayJump" value="${k}" max="${tk}" aria-label="Jump to a day">
    ${future||today?'<span class="btn alt sv dis" aria-disabled="true">Next day →</span>':`<a class="btn alt sv" href="${href.day(next)}" rel="next">Next day →</a>`}
    ${today?'':`<a class="btn alt sv" href="${href.day(tk)}">Today</a>`}</div>`;
  const head=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span><span aria-current="page">Day</span></nav>
    <h2 class="dname">${longDate(d)}${today?' <span class="dbadge dnow">Today</span>':''}</h2>${nav}`;
  if(future){$('page').innerHTML=head+'<section><p class="empty">This day has not happened yet.</p></section>';return true}

  const H=live(S.habits).filter(h=>h.created<=k);
  if(!H.length){$('page').innerHTML=head+`<section><p class="empty">${live(S.habits).length?'No habit existed yet on this day.':'No habits yet.'} <a href="${href.home}">Back to Home</a></p></section>`;return true}

  const HD=daily(H),pchk=periodic(H).filter(h=>isChecked(h,k)).length;   // the day total and the counts are about daily habits; periodic ones are listed separately
  const act=HD.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length,frozen=HD.filter(h=>isFrozen(h,k)).length,skipped=HD.length-act.length-frozen;
  const texts=H.reduce((a,h)=>a+(sumOf(h,k)?1:0)+dayNotes(h,k).filter(n=>n.t.trim()).length,0);
  const p=dayPercent(HD,k,today),g=p===null?null:paint(p);
  const facts=[act.length||!pchk?`${logged} of ${act.length} habit${act.length===1?'':'s'} logged`:'',pchk?`${pchk} periodic checked`:'',skipped?`${skipped} skipped`:'',frozen?`${frozen} frozen`:'',texts?`${texts} note${texts===1?'':'s'} written`:''].filter(Boolean).join(' · ');
  $('page').innerHTML=head+`<section class="dtotal" aria-label="Day total">${g?sq(g.cls,g.style):sq()}
    <div><b class="dtbig">${p===null?'No data':pctText(p)}</b><div class="dtsub">Day total, weighted by importance</div><div class="dtsub">${facts}</div></div></section>
    ${S.cats.map(c=>group(c,k,today)).join('')}`;
  return true}
