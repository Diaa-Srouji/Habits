// The Day page (#/d/<yyyy-mm-dd>) AND the reusable foldable "Log all days" section for Root, Categories, Groups, and Habits.
import {S} from './state.js';
import {$,K,T,add,dateOf,esc} from './util.js';
import {DK,isOff,isFrozen,isLogged,pctOf,dayPercent,paint,pctText,amtFull,txtAmt,sumOf,dayNotes,isManual,imp,sortByOrder,isPeriodic,isChecked,daily,periodic} from './scoring.js';
import {live,inCat,inGroup,inGroupDeep,loose,childGroups} from './categories.js';
import {heatmap} from './heatmap.js';
import {logHTML} from './render.js';
import {href} from './router.js';

const IMPS=['Minor','Low','Normal','High','Critical'];
const longDate=d=>d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const shortDayDate=d=>d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const sq=(cls='',style='',sm=false)=>`<i class="${sm?'dsw-sm':'dsw'}${cls?' '+cls:''}"${style?` style="${style}"`:''} aria-hidden="true"></i>`;
const isFolded=(key,def=false)=>S.fold&&key in S.fold?!!S.fold[key]:def;

function dayDraftOf(h,k){
  return S.dayDrafts?S.dayDrafts[h.id+'|'+k]:null;
}

function dayNoteRow(h,k,n,i,len,text,pfx='d'){
  const at=n.at?new Date(n.at):null,
    time=at?`<span class="ntat" title="Added ${esc(at.toLocaleString())}">${esc(at.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span>`:'';
  const ref=`${h.id}|${k}|${n.id}`,inpId=`${pfx}nt-${h.id}-${k}-${n.id}`;
  return `<li class="ntrow"><div class="nthead"><label for="${inpId}">Note ${i+1}</label>${time}<span class="ntbtns">
    <button type="button" class="btn alt sv" data-dayntup="${ref}" ${i===0?'disabled':''} aria-label="Move note ${i+1} up">↑</button>
    <button type="button" class="btn alt sv" data-dayntdown="${ref}" ${i===len-1?'disabled':''} aria-label="Move note ${i+1} down">↓</button>
    <button type="button" class="rm" data-dayntdel="${ref}" aria-label="Delete note ${i+1}">Delete</button></span></div>
    <textarea id="${inpId}" data-daynt="${ref}" rows="2" placeholder="Write a note…">${esc(text)}</textarea></li>`;
}

// Reusable inline editor body for one habit on one day k
function habitInlineEditor(h,k,{ntFoldKey,hmFoldKey=null,showOpenLink=true,pfx='d'}={}){
  const ns=dayNotes(h,k),ntFold=isFolded(ntFoldKey,true);
  const dr=dayDraftOf(h,k),smVal=dr&&dr.sum!==undefined?dr.sum:sumOf(h,k);
  const dk=h.id+'|'+k;
  const dirty=(S.draft&&dk in S.draft)||(dr&&(dr.sum!==undefined||Object.keys(dr.v||{}).length>0));
  const hmFold=hmFoldKey?isFolded(hmFoldKey,true):true;
  const sumId=`${pfx}sum-${h.id}-${k}`;

  return `<div class="dbody">
    <div class="dlog">${logHTML(h,k,false)}</div>
    ${hmFoldKey?`<div class="dsubfold">
      <button type="button" class="ftog sm" data-fold="${hmFoldKey}" aria-expanded="${!hmFold}"><span class="farr" aria-hidden="true">${hmFold?'▸':'▾'}</span> Heatmap</button>
      ${hmFold?'':`<div class="dhm">${heatmap({habits:[h],one:h,size:'medium',full:true})}</div>`}
    </div>`:''}
    <div class="dsumbox">
      <label for="${sumId}">${h.type==='text'?'Text':'What did you do?'}</label>
      <textarea id="${sumId}" data-daysum="${dk}" rows="2" placeholder="Optional…">${esc(smVal)}</textarea>
    </div>
    <div class="dsubfold">
      <div class="noteshead">
        <button type="button" class="ftog sm" data-fold="${ntFoldKey}" aria-expanded="${!ntFold}"><span class="farr" aria-hidden="true">${ntFold?'▸':'▾'}</span> Notes (${ns.length})</button>
        <span class="ntbtns">
          <button type="button" class="btn alt sv" data-dayntadd="${dk}" data-ntkey="${ntFoldKey}">+ Add note</button>
          ${isManual(h,k)?`<button type="button" class="btn alt sv" data-dayntreset="${dk}">Sort by date</button>`:''}
        </span>
      </div>
      ${ntFold?'':(ns.length?`<ul class="ntrows">${ns.map((n,i)=>dayNoteRow(h,k,n,i,ns.length,dr&&dr.v&&dr.v[n.id]!==undefined?dr.v[n.id]:n.t,pfx)).join('')}</ul>`:'<p class="hint" style="margin:4px 0">No notes yet.</p>')}
    </div>
    <div class="dact">
      <button type="button" class="btn sv" data-daysave="${dk}">Save</button>
      <span class="uns" data-dayuns="${dk}">${dirty?'Unsaved':(S.daySaved===dk?'Saved ✓':'')}</span>
      ${showOpenLink?`<a class="rm" style="margin-left:auto" href="${href.habit(h.id)}">Open habit page</a>`:''}
    </div>
  </div>`;
}

function habitStatus(h,k,today,sm=false){
  const off=isOff(h,k),lg=!off&&isLogged(h,k),v=h.done[k]||0;
  if(isFrozen(h,k))return{square:sq('dic','',sm),cls:' off',stat:'<span class="dbadge dfz">❄ Frozen</span> paused',pc:'<span class="dpct dnone">–</span>',short:'❄ Frozen'};
  if(off)return{square:sq('dsk','',sm),cls:' off',stat:`<span class="dbadge">Skipped</span> ${esc(h.off[k]||'no reason')}`,pc:'<span class="dpct dnone">–</span>',short:'Skipped'};
  if(lg){const p=pctOf(h,v,k),g=paint(p,true);
    return{square:sq(g.cls,g.style,sm),cls:'',stat:`<b>${txtAmt(h,v)}</b>${h.type==='bool'?'':' · '+amtFull(h,v,k)}`,pc:`<span class="dpct">${pctText(p)}</span>`,short:`${txtAmt(h,v)} · ${pctText(p)}`}}
  return{square:sq('','',sm),cls:' none',stat:today?'Not logged yet':h.stop&&h.type==='text'?'No entry · clean day':'Not logged'+(!h.stop?' · 0%':''),pc:'<span class="dpct dnone">–</span>',short:today?'Not logged yet':'Not logged'};
}

// One foldable, editable habit card on the Day page
function card(h,k,today,opts={}){
  const {square,stat,pc,cls}=habitStatus(h,k,today,false);
  const foldKey=opts.foldKey||('hab:'+h.id);
  const hFold=isFolded(foldKey,true);
  const ntKey=opts.ntKey||('nt:'+h.id);
  const hmKey=opts.noHm?null:(opts.hmKey||('hm:'+h.id));
  const pfx=opts.pfx||'d';

  const body=hFold?'':habitInlineEditor(h,k,{ntFoldKey:ntKey,hmFoldKey:hmKey,showOpenLink:opts.showOpenLink!==false,pfx});

  return `<article class="dcard${cls}${hFold?' folded':''}" data-daycard="${h.id}|${k}">
    <div class="dchead">
      <button type="button" class="ftog" data-fold="${foldKey}" aria-expanded="${!hFold}" aria-label="${hFold?'Expand':'Fold'} ${esc(h.name)}"><span class="farr" aria-hidden="true">${hFold?'▸':'▾'}</span></button>
      ${square}
      <div class="dmain">
        <div class="dtop"><a class="name nm" href="${href.habit(h.id)}">${esc(h.name)}</a>${isPeriodic(h)?'<span class="dbadge dper">periodic</span>':''}${pc}</div>
        <div class="dstat">${stat}<span class="dimp"> · Imp ${imp(h)} (${IMPS[imp(h)-1]})</span></div>
      </div>
    </div>
    ${body}
  </article>`;
}

// Show habits that existed on day k and were NOT frozen on day k
const shownOnDay=(h,k)=>h.created<=k&&!isFrozen(h,k);

function dayGroupSection(g,k,today,depth=0,pfxKey='',idPfx='d'){
  const allDeep=inGroupDeep(S.habits,S.grps,g).filter(h=>shownOnDay(h,k));
  if(!allDeep.length)return '';
  const direct=sortByOrder(inGroup(S.habits,g)).filter(h=>shownOnDay(h,k));
  const subs=childGroups(S.grps,g.cat,g.id);
  const gKey=pfxKey?`${pfxKey}:g:${g.id}`:'grp:'+g.id;
  const gFold=isFolded(gKey,pfxKey?true:depth>0);
  const dh=daily(allDeep),p=dayPercent(dh,k,today),act=dh.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length;
  const sub=`${logged} of ${act.length} logged${p===null?'':' · '+pctText(p)}`;
  return `<div class="dsubgrp${depth?' nested':''}">
    <div class="dgh">
      <button type="button" class="ftog" data-fold="${gKey}" aria-expanded="${!gFold}"><span class="farr" aria-hidden="true">${gFold?'▸':'▾'}</span> <b>${esc(g.name)}</b></button>
      <span class="dgs">${sub}</span>
    </div>
    ${gFold?'':`<div class="dcards">${direct.map(h=>card(h,k,today,pfxKey?{foldKey:`${pfxKey}:h:${h.id}`,ntKey:`${pfxKey}:nt:${h.id}`,noHm:true,pfx:'al-'+scopeKey.replace(/[^\w-]/g,'-')}:{})).join('')}</div>${subs.map(sg=>dayGroupSection(sg,k,today,depth+1,pfxKey,idPfx)).join('')}`}
  </div>`;
}

function categorySection(c,k,today,pfxKey='',idPfx='d'){
  const hs=sortByOrder(inCat(S.habits,c.id)).filter(h=>shownOnDay(h,k));
  if(!hs.length)return '';
  const dh=daily(hs),pn=periodic(hs).filter(h=>isChecked(h,k)).length,p=dayPercent(dh,k,today),act=dh.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length;
  const sub=[act.length?`${logged} of ${act.length} logged${p===null?'':' · '+pctText(p)}`:'',pn?`${pn} periodic checked`:''].filter(Boolean).join(' · ');
  const cKey=pfxKey?`${pfxKey}:c:${c.id}`:'cat:'+c.id;
  const cFold=isFolded(cKey,!!pfxKey);
  const own=loose(hs,c.id,S.grps);
  const topGrps=childGroups(S.grps,c.id,null);
  return `<section class="dgrp${pfxKey?' alcat':''}" style="--c:${c.color}" aria-labelledby="dg-${esc(cKey)}">
    <div class="dgh">
      <h3 id="dg-${esc(cKey)}"><button type="button" class="ftog" data-fold="${cKey}" aria-expanded="${!cFold}"><span class="farr" aria-hidden="true">${cFold?'▸':'▾'}</span><span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>${esc(c.name)}</button></h3>
      <span class="dgs">${sub}</span>
    </div>
    ${cFold?'':`${own.length?`<div class="dcards">${own.map(h=>card(h,k,today,pfxKey?{foldKey:`${pfxKey}:h:${h.id}`,ntKey:`${pfxKey}:nt:${h.id}`,noHm:true,pfx:'al-'+scopeKey.replace(/[^\w-]/g,'-')}:{})).join('')}</div>`:''}${topGrps.map(g=>dayGroupSection(g,k,today,0,pfxKey,idPfx)).join('')}`}
  </section>`;
}

// ---- Reusable foldable "Log all days" section for Root ('a'), Category ('c'), Group ('g'), and Habit ('h') ----
function allDaysRowBody(sc,id,k,today,scopeKey){
  const pfxKey=`al:${scopeKey}:${k}`,idPfx='al-'+scopeKey.replace(/[^\w-]/g,'-');
  if(sc==='h'){
    const h=S.habits.find(x=>x.id===id);
    if(!h)return '';
    return `<div class="al-hab-body" data-daycard="${h.id}|${k}">${habitInlineEditor(h,k,{ntFoldKey:`${pfxKey}:nt:${h.id}`,hmFoldKey:null,showOpenLink:false,pfx:'al-'+scopeKey.replace(/[^\w-]/g,'-')})}</div>`;
  }
  if(sc==='g'){
    const g=S.grps.find(x=>x.id===id);
    if(!g)return '';
    const direct=sortByOrder(inGroup(S.habits,g)).filter(h=>shownOnDay(h,k));
    const subs=childGroups(S.grps,g.cat,g.id);
    const out=`${direct.length?`<div class="dcards">${direct.map(h=>card(h,k,today,{foldKey:`${pfxKey}:h:${h.id}`,ntKey:`${pfxKey}:nt:${h.id}`,noHm:true,pfx:'al-'+scopeKey.replace(/[^\w-]/g,'-')})).join('')}</div>`:''}${subs.map(sg=>dayGroupSection(sg,k,today,0,pfxKey,idPfx)).join('')}`;
    return out||'<p class="hint" style="margin:6px 0">No active habits on this day.</p>';
  }
  if(sc==='c'){
    const c=S.cats.find(x=>x.id===id);
    if(!c)return '';
    const hs=sortByOrder(inCat(S.habits,c.id)).filter(h=>shownOnDay(h,k));
    const own=loose(hs,c.id,S.grps);
    const topGrps=childGroups(S.grps,c.id,null);
    const out=`${own.length?`<div class="dcards">${own.map(h=>card(h,k,today,{foldKey:`${pfxKey}:h:${h.id}`,ntKey:`${pfxKey}:nt:${h.id}`,noHm:true,pfx:'al-'+scopeKey.replace(/[^\w-]/g,'-')})).join('')}</div>`:''}${topGrps.map(g=>dayGroupSection(g,k,today,0,pfxKey,idPfx)).join('')}`;
    return out||'<p class="hint" style="margin:6px 0">No active habits on this day.</p>';
  }
  // Root ('a'): foldable categories -> foldable groups -> foldable habits
  const catsHTML=S.cats.map(c=>categorySection(c,k,today,pfxKey,idPfx)).filter(Boolean).join('');
  return catsHTML||'<p class="hint" style="margin:6px 0">No active habits on this day.</p>';
}

export function allDaysSection(sc,id,hs){
  if(!hs||!hs.length)return '';
  const scopeKey=`${sc}:${id}`,foldKey=`al:${scopeKey}`,folded=isFolded(foldKey,true);
  const t=T(),tk=K(t),yk=K(add(t,-1));
  const earliest=hs.reduce((m,h)=>h.created<m?h.created:m,tk);
  const totalDays=Math.max(1,Math.round((dateOf(tk)-dateOf(earliest))/864e5)+1);
  const tid=`alT-${esc(sc)}-${esc(id)}`;

  if(folded){
    return `<section class="alldays" aria-labelledby="${tid}">
      <div class="sec-hd" style="margin:0">
        <h2 id="${tid}"><button type="button" class="ftog" data-fold="${foldKey}" aria-expanded="false"><span class="farr" aria-hidden="true">▸</span> Log all days</button></h2>
        <span class="hint" style="margin:0">${totalDays} day${totalDays===1?'':'s'}</span>
      </div>
    </section>`;
  }

  const lim=(S.alLimit&&S.alLimit[scopeKey])||14;
  const shownCount=Math.min(totalDays,lim);
  const days=[];
  for(let i=0;i<shownCount;i++)days.push(K(add(t,-i)));

  const rows=days.map(k=>{
    const d=dateOf(k),today=k===tk,dFoldKey=`ald:${scopeKey}:${k}`,dFold=isFolded(dFoldKey,true);
    const lbl=(today?'Today · ':k===yk?'Yesterday · ':'')+shortDayDate(d);
    let sw,summary;
    if(sc==='h'){
      const st=habitStatus(hs[0],k,today,true);
      sw=st.square;summary=st.short;
    }else{
      const activeOnDay=hs.filter(h=>shownOnDay(h,k));
      const dh=daily(activeOnDay),p=dayPercent(dh,k,today),act=dh.filter(h=>!isOff(h,k)),logged=act.filter(h=>isLogged(h,k)).length;
      const g=p===null?null:paint(p);
      sw=g?sq(g.cls,g.style,true):sq('','',true);
      const pn=periodic(activeOnDay).filter(h=>isChecked(h,k)).length;
      summary=[act.length?`${logged}/${act.length} logged${p===null?'':' · '+pctText(p)}`:'',pn?`${pn} periodic`:''].filter(Boolean).join(' · ')||'No active habits';
    }
    return `<div class="alday${dFold?' folded':''}">
      <div class="alday-h">
        <button type="button" class="ftog alday-tog" data-fold="${dFoldKey}" aria-expanded="${!dFold}">
          <span class="farr" aria-hidden="true">${dFold?'▸':'▾'}</span>
          ${sw}
          <span class="alday-date">${esc(lbl)}</span>
        </button>
        <span class="alday-sum">${esc(summary)}${sc==='a'?` <a class="alday-open" href="${href.day(k)}" title="Open full day page">↗</a>`:''}</span>
      </div>
      ${dFold?'':`<div class="alday-b">${allDaysRowBody(sc,id,k,today,scopeKey)}</div>`}
    </div>`;
  }).join('');

  const moreBar=shownCount<totalDays?`<div class="almore">
    <button type="button" class="btn alt sv" data-almore="${scopeKey}|14">Show 14 more days</button>
    <button type="button" class="btn alt sv" data-almore="${scopeKey}|${totalDays}">Show all (${totalDays} days)</button>
  </div>`:'';

  return `<section class="alldays" aria-labelledby="${tid}">
    <div class="sec-hd">
      <h2 id="${tid}"><button type="button" class="ftog" data-fold="${foldKey}" aria-expanded="true"><span class="farr" aria-hidden="true">▾</span> Log all days</button></h2>
      <div class="altools">
        <input type="date" data-aljump="${scopeKey}" min="${earliest}" max="${tk}" value="${esc((S.alJump&&S.alJump[scopeKey])||tk)}" aria-label="Jump to a day in Log all days">
        <button type="button" class="btn alt sv" data-alfold="${scopeKey}">Fold all days</button>
      </div>
    </div>
    <div class="aldays">${rows}</div>
    ${moreBar}
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
