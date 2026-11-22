// The Day page (#/d/<yyyy-mm-dd>): editable all-in-one view for one day across all habits, grouped by category & nested groups.
// Everything is foldable: categories, groups, habits, heatmaps, and notes.
import {S} from './state.js';
import {$,K,T,add,dateOf,esc} from './util.js';
import {DK,isOff,isFrozen,isLogged,pctOf,dayPercent,paint,pctText,amtFull,txtAmt,sumOf,dayNotes,isManual,imp,sortByOrder,isPeriodic,isChecked,daily,periodic} from './scoring.js';
import {live,inCat,inGroup,inGroupDeep,loose,childGroups} from './categories.js';
import {heatmap} from './heatmap.js';
import {logHTML} from './render.js';
import {href} from './router.js';

const IMPS=['Minor','Low','Normal','High','Critical'];
const longDate=d=>d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const sq=(cls='',style='')=>`<i class="dsw${cls?' '+cls:''}"${style?` style="${style}"`:''} aria-hidden="true"></i>`;
const isFolded=(key,def=false)=>S.fold&&key in S.fold?!!S.fold[key]:def;

function dayDraftOf(h,k){
  return S.dayDrafts&&S.dayDrafts.k===k&&S.dayDrafts.byH?S.dayDrafts.byH[h.id]:null;
}

function dayNoteRow(h,k,n,i,len,text){
  const at=n.at?new Date(n.at):null,
    time=at?`<span class="ntat" title="Added ${esc(at.toLocaleString())}">${esc(at.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span>`:'';
  const ref=`${h.id}|${k}|${n.id}`;
  return `<li class="ntrow"><div class="nthead"><label for="dnt-${h.id}-${n.id}">Note ${i+1}</label>${time}<span class="ntbtns">
    <button class="btn alt sv" data-dayntup="${ref}" ${i===0?'disabled':''} aria-label="Move note ${i+1} up">↑</button>
    <button class="btn alt sv" data-dayntdown="${ref}" ${i===len-1?'disabled':''} aria-label="Move note ${i+1} down">↓</button>
    <button class="rm" data-dayntdel="${ref}" aria-label="Delete note ${i+1}">Delete</button></span></div>
    <textarea id="dnt-${h.id}-${n.id}" data-daynt="${ref}" rows="2" placeholder="Write a note…">${esc(text)}</textarea></li>`;
}

// One foldable, editable habit card on the Day page
function card(h,k,today){
  const off=isOff(h,k),lg=!off&&isLogged(h,k),v=h.done[k]||0;
  let square,stat,pc='<span class="dpct dnone">–</span>',cls='';
  if(isFrozen(h,k)){square='<i class="dsw dic" aria-hidden="true"></i>';cls=' off';
    stat='<span class="dbadge dfz">❄ Frozen</span> paused'}
  else if(off){square='<i class="dsw dsk" aria-hidden="true"></i>';cls=' off';
    stat=`<span class="dbadge">Skipped</span> ${esc(h.off[k]||'no reason')}`}
  else if(lg){const p=pctOf(h,v,k),g=paint(p,true);square=sq(g.cls,g.style);
    stat=`<b>${txtAmt(h,v)}</b>${h.type==='bool'?'':' · '+amtFull(h,v,k)}`;
    pc=`<span class="dpct">${pctText(p)}</span>`}
  else{square=sq();cls=' none';
    stat=today?'Not logged yet':h.stop&&h.type==='text'?'No entry · clean day':'Not logged'+(!h.stop?' · 0%':'')}

  const hFold=isFolded('hab:'+h.id,true);
  const hmFold=isFolded('hm:'+h.id,true);
  const ns=dayNotes(h,k),ntFold=isFolded('nt:'+h.id,true);
  const dr=dayDraftOf(h,k),smVal=dr&&dr.sum!==undefined?dr.sum:sumOf(h,k);
  const dk=h.id+'|'+k;
  const dirty=(S.draft&&dk in S.draft)||(dr&&(dr.sum!==undefined||Object.keys(dr.v||{}).length>0));

  const body=hFold?'':`<div class="dbody">
    <div class="dlog">${logHTML(h,k,false)}</div>
    <div class="dsubfold">
      <button type="button" class="ftog sm" data-fold="hm:${h.id}" aria-expanded="${!hmFold}"><span class="farr" aria-hidden="true">${hmFold?'▸':'▾'}</span> Heatmap</button>
      ${hmFold?'':`<div class="dhm">${heatmap({habits:[h],one:h,size:'medium',full:true})}</div>`}
    </div>
    <div class="dsumbox">
      <label for="dsum-${h.id}">${h.type==='text'?'Text':'What did you do?'}</label>
      <textarea id="dsum-${h.id}" data-daysum="${dk}" rows="2" placeholder="Optional…">${esc(smVal)}</textarea>
    </div>
    <div class="dsubfold">
      <div class="noteshead">
        <button type="button" class="ftog sm" data-fold="nt:${h.id}" aria-expanded="${!ntFold}"><span class="farr" aria-hidden="true">${ntFold?'▸':'▾'}</span> Notes (${ns.length})</button>
        <span class="ntbtns">
          <button type="button" class="btn alt sv" data-dayntadd="${dk}">+ Add note</button>
          ${isManual(h,k)?`<button type="button" class="btn alt sv" data-dayntreset="${dk}">Sort by date</button>`:''}
        </span>
      </div>
      ${ntFold?'':(ns.length?`<ul class="ntrows">${ns.map((n,i)=>dayNoteRow(h,k,n,i,ns.length,dr&&dr.v&&dr.v[n.id]!==undefined?dr.v[n.id]:n.t)).join('')}</ul>`:'<p class="hint" style="margin:4px 0">No notes yet.</p>')}
    </div>
    <div class="dact">
      <button type="button" class="btn sv" data-daysave="${dk}">Save</button>
      <span class="uns" data-dayuns="${h.id}">${dirty?'Unsaved':(S.daySaved===dk?'Saved ✓':'')}</span>
      <a class="rm" style="margin-left:auto" href="${href.habit(h.id)}">Open habit page</a>
    </div>
  </div>`;

  return `<article class="dcard${cls}${hFold?' folded':''}" data-daycard="${h.id}">
    <div class="dchead">
      <button type="button" class="ftog" data-fold="hab:${h.id}" aria-expanded="${!hFold}" aria-label="${hFold?'Expand':'Fold'} ${esc(h.name)}"><span class="farr" aria-hidden="true">${hFold?'▸':'▾'}</span></button>
      ${square}
      <div class="dmain">
        <div class="dtop"><a class="name nm" href="${href.habit(h.id)}">${esc(h.name)}</a>${isPeriodic(h)?'<span class="dbadge dper">periodic</span>':''}${pc}</div>
        <div class="dstat">${stat}<span class="dimp"> · Imp ${imp(h)} (${IMPS[imp(h)-1]})</span></div>
      </div>
    </div>
    ${body}
  </article>`;
}

// Show habits that existed on day k and were NOT frozen on day k (so frozen habits behave like archived on frozen days, while past logs remain visible!)
const shownOnDay=(h,k)=>h.created<=k&&!isFrozen(h,k);

function dayGroupSection(g,k,today,depth=0){
  const allDeep=inGroupDeep(S.habits,S.grps,g).filter(h=>shownOnDay(h,k));
  if(!allDeep.length)return '';
  const direct=sortByOrder(inGroup(S.habits,g)).filter(h=>shownOnDay(h,k));
  const subs=childGroups(S.grps,g.cat,g.id);
  const gFold=isFolded('grp:'+g.id,depth>0);
  const dh=daily(allDeep),p=dayPercent(dh,k,today),act=dh.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length;
  const sub=`${logged} of ${act.length} logged${p===null?'':' · '+pctText(p)}`;
  return `<div class="dsubgrp${depth?' nested':''}">
    <div class="dgh">
      <button type="button" class="ftog" data-fold="grp:${g.id}" aria-expanded="${!gFold}"><span class="farr" aria-hidden="true">${gFold?'▸':'▾'}</span> <b>${esc(g.name)}</b></button>
      <span class="dgs">${sub}</span>
    </div>
    ${gFold?'':`<div class="dcards">${direct.map(h=>card(h,k,today)).join('')}</div>${subs.map(sg=>dayGroupSection(sg,k,today,depth+1)).join('')}`}
  </div>`;
}

function categorySection(c,k,today){
  const hs=sortByOrder(inCat(S.habits,c.id)).filter(h=>shownOnDay(h,k));
  if(!hs.length)return '';
  const dh=daily(hs),pn=periodic(hs).filter(h=>isChecked(h,k)).length,p=dayPercent(dh,k,today),act=dh.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length;
  const sub=[act.length?`${logged} of ${act.length} logged${p===null?'':' · '+pctText(p)}`:'',pn?`${pn} periodic checked`:''].filter(Boolean).join(' · ');
  const cFold=isFolded('cat:'+c.id,false);
  const own=loose(hs,c.id,S.grps);
  const topGrps=childGroups(S.grps,c.id,null);
  return `<section class="dgrp" style="--c:${c.color}" aria-labelledby="dg-${c.id}">
    <div class="dgh">
      <h3 id="dg-${c.id}"><button type="button" class="ftog" data-fold="cat:${c.id}" aria-expanded="${!cFold}"><span class="farr" aria-hidden="true">${cFold?'▸':'▾'}</span><span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>${esc(c.name)}</button></h3>
      <span class="dgs">${sub}</span>
    </div>
    ${cFold?'':`${own.length?`<div class="dcards">${own.map(h=>card(h,k,today)).join('')}</div>`:''}${topGrps.map(g=>dayGroupSection(g,k,today,0)).join('')}`}
  </section>`;
}

export function renderDay(k){
  if(!DK.test(k)||K(dateOf(k))!==k)return false;
  S.dayView=k;
  const t=T(),tk=K(t),d=dateOf(k),today=k===tk,future=k>tk;
  const prev=K(add(d,-1)),next=K(add(d,1));
  document.title=longDate(d)+' · Habit tracker';
  const nav=`<div class="daynav"><a class="btn alt sv" href="${href.day(prev)}" rel="prev">← Prev</a>
    <input type="date" id="dayJump" value="${k}" max="${tk}" aria-label="Jump to a day">
    ${future||today?'<span class="btn alt sv dis" aria-disabled="true">Next →</span>':`<a class="btn alt sv" href="${href.day(next)}" rel="next">Next →</a>`}
    ${today?'':`<a class="btn alt sv" href="${href.day(tk)}">Today</a>`}
    <span class="foldtools"><button type="button" class="btn alt sv" data-foldall="1">Fold all</button><button type="button" class="btn alt sv" data-foldall="0">Expand all</button></span></div>`;
  const head=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span><span aria-current="page">Day</span></nav>
    <h2 class="dname">${longDate(d)}${today?' <span class="dbadge dnow">Today</span>':''}</h2>${nav}`;
  if(future){$('page').innerHTML=head+'<section><p class="empty">This day has not happened yet.</p></section>';return true}

  const H=live(S.habits).filter(h=>h.created<=k);
  if(!H.length){$('page').innerHTML=head+`<section><p class="empty">${live(S.habits).length?'No habit existed yet on this day.':'No habits yet.'} <a href="${href.home}">Back to Home</a></p></section>`;return true}

  const HD=daily(H),pchk=periodic(H).filter(h=>isChecked(h,k)).length;
  const act=HD.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length,frozen=HD.filter(h=>isFrozen(h,k)).length,skipped=HD.length-act.length-frozen;
  const texts=H.reduce((a,h)=>a+(sumOf(h,k)?1:0)+dayNotes(h,k).filter(n=>n.t.trim()).length,0);
  const p=dayPercent(HD,k,today),g=p===null?null:paint(p);
  const facts=[act.length||!pchk?`${logged} of ${act.length} habit${act.length===1?'':'s'} logged`:'',pchk?`${pchk} periodic checked`:'',skipped?`${skipped} skipped`:'',frozen?`${frozen} frozen`:'',texts?`${texts} note${texts===1?'':'s'} written`:''].filter(Boolean).join(' · ');
  $('page').innerHTML=head+`<section class="dtotal" aria-label="Day total">${g?sq(g.cls,g.style):sq()}
    <div><b class="dtbig">${p===null?'No data':pctText(p)}</b><div class="dtsub">Day total, weighted by importance</div><div class="dtsub">${facts}</div></div></section>
    ${S.cats.map(c=>categorySection(c,k,today)).join('')}`;
  return true}
