// Turns state into HTML: picks the page from the address (Home, Category, Habit, Day, Edit habits) and builds the views.
import {S} from './state.js';
import {$,K,T,esc,fmt,pct} from './util.js';
import {isOff,isFrozen,isFrozenNow,freezeState,extendFreeze,streak,best,count,span,todayOf,typeLabel,periods,norm,SHORT,shortAmt,pctOf,pctText,amtPct,paint,imp,goalOn,goalVal,goalHistory,needsGoalLog,sumOf,dayNotes,isManual,pruneEmpty,textDays,sortByOrder,isPeriodic,freqText,daily,periodic,cleanFreq,fmtHHMM,reqHistory,reqOn,reqText,reqStreaks} from './scoring.js';
import {exportCodeDB} from './codedb.js';
import {heatmap,legendHTML,hidePop,rove,modeSwitch} from './heatmap.js';
import {live,unassigned,inCat,inGroup,inGroupDeep,loose,childGroups,groupTreeList,groupPath,nextColor} from './categories.js';
import {parseHash,href} from './router.js';
import {renderHome} from './home.js';
import {renderDay} from './day.js';
import {save} from './sync.js';
import {habitStats,habitRows,categoryStats,categoryRows,startOf,rangeDefault,checkRange} from './stats.js';

const isFolded=(key,def=false)=>S.fold&&key in S.fold?!!S.fold[key]:def;

export function levelHint(h){
  if(h.type==='text')return h.stop?'Slip log: no entry = clean day. Write what happened (optional) and a percentage.':'Type your own percentage (0–100%+). Text is optional.';
  if(h.type==='bool')return 'Choose one and press Save.';
  if(h.type==='min')return 'Type time as hh:mm (e.g. 01:30) or minutes, or tap a shortcut.';
  if(h.stop)return 'Type an amount or tap a shortcut (% of limit). Up to limit = 100%, double limit = 0%.';
  return 'Type an amount or tap a shortcut (% of goal). Leave empty for not logged, or 0 for zero day.'}

const IMPS=['Minor','Low','Normal','High','Critical'];
export const FQ_OPTS=[['week','times per week'],['month','times per month'],['days','days apart (every X days)']];

function frzBanner(h){const st=freezeState(h);if(!st.on&&!st.pending)return '';
  return `<div class="frzbanner" role="status"><span>${st.on?`❄ Frozen since ${esc(fmt(st.since))}. Hidden from active lists; past logs remain in heatmaps & stats.`:`❄ Freezes tomorrow (${esc(fmt(st.since))}).`}</span><a class="btn sv" href="${href.manage}">Manage in Edit habits</a></div>`}

function streakHTML(h){if(isPeriodic(h))return '';
  const n=streak(h),bst=best(h),tier=n>=30?4:n>=14?3:n>=7?2:n>=3?1:n>=1?0:-1;
  const risk=n&&!isOff(h,K(T()))&&!(h.done[K(T())]>0||(h.skip||{})[K(T())])?'<span class="risk">Log today to keep it going</span>':'';
  if(tier<0)return `<span class="streak s-off"><span class="flame">🔥</span>No streak yet</span><span>Best <b>${bst}</b></span>`;
  return `<span class="streak s${tier}" title="Best streak: ${bst} days"><span class="flame">🔥</span><b>${n}</b> day${n===1?'':'s'}</span><span>Best <b>${bst}</b></span>${risk}`}

export function logHTML(h,k,sv=true){const dk=h.id+'|'+k,cur=h.done[k]>0?h.done[k]:((h.skip||{})[k]?0:null),
  dirty=!!S.draft&&dk in S.draft&&S.draft[dk]!==cur,v=dirty?S.draft[dk]:cur,u=esc(h.unit),
  grp=esc(h.name)+', '+(k===K(T())?'today':fmt(k)),
  tkey=dk+'#t',tdirty=!!S.draft&&tkey in S.draft&&S.draft[tkey]!==sumOf(h,k),tv=tdirty?S.draft[tkey]:sumOf(h,k);
  if(isFrozen(h,k))return `<span class="log"><span class="frzbadge">❄ Frozen</span><button class="btn alt sv" data-unfreezeday="${dk}" title="Make just this day a normal day again">Unfreeze this day</button></span>`;
  if(isOff(h,k))return `<span class="log"><span class="skipbadge">Skipped · ${esc(h.off[k]||'no reason')}</span><button class="btn alt sv" data-unskip="${dk}">Undo skip</button></span>`;
  if(S.skipFor===dk)return `<span class="log skippanel"><select class="skipReason" aria-label="Reason">${['Ill','Travel','Rest','Busy','Other…'].map(r=>`<option>${r}</option>`).join('')}</select><input class="skipCustom" placeholder="Reason" maxlength="40" hidden aria-label="Custom reason"><button class="btn sv" data-skipgo="${dk}">Skip this day</button><button class="btn alt sv" data-skipcancel="1">Cancel</button></span>`;
  const tail=(sv?`<button class="btn sv" data-save="${dk}">Save</button>`:'')+`<button class="btn alt sv" data-skipopen="${dk}">Skip day</button><span class="uns">${dirty||tdirty?'Unsaved':''}</span></span>`;
  if(h.type==='bool'){const opts=h.stop?[[0,'Avoided it',1],[1,'Slipped',0]]:[[1,'Done',1],[0,'Not done',0]];
    return `<span class="log" role="group" aria-label="${grp}">`+opts.map(o=>{const g=paint(o[2]);return `<button class="bt ${g.cls}"${g.style?` style="${g.style}"`:''} data-bool="${dk}|${o[0]}" aria-pressed="${v!==null&&v===o[0]}">${o[1]}</button>`}).join('')+tail}
  if(h.type==='text'){const p=v===null?null:pctOf(h,v,k),sim=p===null?null:paint(p,true);
    return `<span class="log txtlog" role="group" aria-label="${grp}">`+(sv?`<input class="txtin" type="text" data-txt="${dk}" value="${esc(tv)}" maxlength="200" placeholder="${h.stop?'What happened? (optional)':'Write something (optional)'}" aria-label="Text, ${grp}">`:'')+
    `<input type="number" min="0" step="any" inputmode="decimal" value="${v===null?'':v}" placeholder="%" data-amt="${dk}" aria-label="Percentage for the day"><span>%</span>`+
    `<i class="sim${sim?' '+sim.cls:''}"${sim&&sim.style?` style="${sim.style}"`:''} aria-hidden="true"></i>`+
    `<span class="lvname">${p===null?(k===K(T())?'Not logged yet':'Not logged'):pctText(p)}</span>`+tail}
  const p=v===null?null:pctOf(h,v,k),sim=p===null?null:paint(p,true),rel=h.stop?'of limit':'of goal',isM=h.type==='min';
  const inp=isM?`<input type="text" inputmode="numeric" value="${v===null?'':fmtHHMM(v)}" placeholder="hh:mm" data-amt="${dk}" aria-label="Time (hh:mm)" style="width:76px">`
    :`<input type="number" min="0" step="any" inputmode="decimal" value="${v===null?'':v}" placeholder="0" data-amt="${dk}" aria-label="${u} done"><span>${u}</span>`;
  return `<span class="log" role="group" aria-label="${grp}">${inp}`+
  `<i class="sim${sim?' '+sim.cls:''}"${sim&&sim.style?` style="${sim.style}"`:''} aria-hidden="true"></i>`+
  SHORT.map((m,i)=>{const a=shortAmt(h,m,k),g=paint(pctOf(h,a,k)),t=m===0?'0':Math.round(m*100)+'%',tip=`${isM?fmtHHMM(a):a+' '+u}`+(m===0?'':` (${t} ${rel})`);
    return `<button class="lv" data-lvl="${dk}|${i}" aria-pressed="${v!==null&&Math.abs(v-a)<1e-9}" title="${tip}" aria-label="${tip}"><i class="${g.cls}"${g.style?` style="${g.style}"`:''}></i>${t}</button>`}).join('')+
  `<span class="lvname">${p===null?(k===K(T())?'Not logged yet':'Not logged'):amtPct(h,v,k)}</span>`+tail}

function renderAssign(need){const d=S.assignDraft||{};
  const opts=sel=>'<option value="">Choose…</option>'+S.cats.map(c=>`<option value="${c.id}"${sel===c.id?' selected':''}>${esc((c.icon?c.icon+' ':'')+c.name)}</option>`).join('');
  $('assign').innerHTML=`<h2>Sort your habits into categories</h2>
  <p class="hint">Pick a category for each habit. Nothing is deleted, and you can change a category later.</p>
  <div class="dayrow"><label for="assignAll">Set all to</label><select id="assignAll" aria-label="Set all habits to a category">${opts('')}</select></div>
  ${need.map(h=>`<div class="assignrow"><span class="name">${esc(h.name)}</span><select data-assign="${h.id}" aria-label="Category for ${esc(h.name)}">${opts(d[h.id])}</select></div>`).join('')}
  <div class="dayrow"><button class="btn" data-assignsave="1">Save categories</button><span id="assignmsg" class="uns" role="status"></span></div>`}

// ---- Unified, foldable Statistics section (always at the bottom of Home, Category, Group, and Habit pages) ----
// sc: 'a' (Home / custom habit picker), 'c' (category), 'g' (group + nested sub-groups), 'h' (single habit)
const statGrid=rows=>`<dl class="stgrid">${rows.map(r=>`<div class="stc${r[2]&&r[2]!=='ice'?' '+r[2]:''}"><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('')}</dl>`;
function statHTML(hs,sc,from,to){
  if(!hs.length)return '<p class="hint">Select at least one habit to view statistics.</p>';
  if(sc==='h'||hs.length===1)return statGrid(habitRows(hs[0],habitStats(hs[0],from,to)));
  return statGrid(categoryRows(categoryStats(hs,from,to)));
}
function selectedHomeHabits(){
  const all=live(S.habits);
  if(!S.statPick)return all;
  return all.filter(h=>S.statPick.includes(h.id));
}
function statTarget(key){
  const i=key.indexOf(':'),sc=key.slice(0,i),id=key.slice(i+1);
  if(sc==='a')return{sc,hs:selectedHomeHabits()};
  if(sc==='h')return{sc,hs:S.habits.filter(h=>h.id===id)};
  if(sc==='g'){const g=S.grps.find(x=>x.id===id);return{sc,hs:g?inGroupDeep(S.habits,S.grps,g):[]}}
  return{sc,hs:inCat(S.habits,id)};
}
function rangeOf(key,hs){
  const today=K(T()),st=startOf(hs),r=(S.range&&S.range[key])||{};
  if(r.from!==undefined||r.to!==undefined)return{mode:r.mode||'custom',from:r.from||'',to:r.to||''};
  return{mode:'all',from:st,to:today};
}
function rangeBody(key,hs,sc){
  if(!hs.length)return '<p class="hint">Select at least one habit above to see statistics.</p>';
  const {from,to}=rangeOf(key,hs),bad=checkRange(from,to);
  if(bad)return `<p class="hint" role="status">${bad}</p>`;
  const st=startOf(hs),note=from<st?`<p class="hint">Counting starts on ${esc(fmt(st))}.</p>`:'';
  return note+statHTML(hs,sc,from,to);
}
const rangeInput=(key,w)=>[...document.querySelectorAll('[data-range]')].find(el=>el.dataset.range===key+'|'+w);
function paintRange(key){
  const {sc,hs}=statTarget(key),box=[...document.querySelectorAll('.strange')].find(b=>b.dataset.strange===key);
  if(box)box.innerHTML=rangeBody(key,hs,sc);
}
export function refreshRange(key){
  const f=rangeInput(key,'from'),t=rangeInput(key,'to');
  (S.range=S.range||{})[key]={mode:'custom',from:f?f.value:'',to:t?t.value:''};
  document.querySelectorAll(`[data-rangepreset^="${key}|"]`).forEach(b=>b.setAttribute('aria-pressed','false'));
  paintRange(key);
}
export function setRangePreset(key,preset){
  const {hs}=statTarget(key),today=K(T());
  const r=preset==='month'?rangeDefault(startOf(hs)):{from:startOf(hs),to:today};
  (S.range=S.range||{})[key]={mode:preset,from:r.from,to:r.to};
  ['from','to'].forEach(w=>{const el=rangeInput(key,w);if(el)el.value=r[w]});
  document.querySelectorAll(`[data-rangepreset^="${key}|"]`).forEach(b=>b.setAttribute('aria-pressed',b.dataset.rangepreset===key+'|'+preset));
  paintRange(key);
}
export function statsSection(sc,id,hs){
  const key=sc+':'+id,today=K(T()),targetHs=sc==='a'?selectedHomeHabits():hs;
  const {mode,from,to}=rangeOf(key,targetHs.length?targetHs:hs);
  const tid='stT-'+esc(id),foldKey='st:'+key,folded=isFolded(foldKey,true);
  const allLive=sc==='a'?live(S.habits):[];
  const allPicked=!S.statPick;
  const picker=sc==='a'?`<div class="stpick">
    <div class="stpick-bar">
      <span class="stpick-lbl">Habits:</span>
      <button type="button" class="stchip" data-statpick="all" aria-pressed="${allPicked}">All (${allLive.length})</button>
      <button type="button" class="stchip" data-statpick="none" aria-pressed="${!allPicked&&S.statPick.length===0}">Clear</button>
    </div>
    <div class="stpick-list">${allLive.map(h=>{
      const on=allPicked||S.statPick.includes(h.id);
      return `<label class="stopt${on?' on':''}"><input type="checkbox" data-statcheck="${h.id}" ${on?'checked':''}><span>${esc(h.name)}</span></label>`;
    }).join('')}</div>
  </div>`:'';

  return `<section class="stats" aria-labelledby="${tid}">
    <div class="sec-hd">
      <h2 id="${tid}"><button type="button" class="ftog" data-fold="${foldKey}" aria-expanded="${!folded}"><span class="farr" aria-hidden="true">${folded?'▸':'▾'}</span> Statistics</button></h2>
      ${folded?`<span class="hint" style="margin:0">${mode==='all'?'All time':mode==='month'?'Last month':esc(from)+' → '+esc(to)}</span>`:''}
    </div>
    ${folded?'':`<div class="stbar">
      <div class="stpresets" role="group" aria-label="Date range presets">
        <button type="button" class="stchip" data-rangepreset="${key}|all" aria-pressed="${mode==='all'}">All time</button>
        <button type="button" class="stchip" data-rangepreset="${key}|month" aria-pressed="${mode==='month'}">Last month</button>
      </div>
      <div class="stdates">
        <label class="rl">From <input type="date" data-range="${key}|from" value="${esc(from)}" max="${today}"></label>
        <label class="rl">To <input type="date" data-range="${key}|to" value="${esc(to)}" max="${today}"></label>
      </div>
    </div>
    ${picker}
    <div class="strange" data-strange="${key}" aria-live="polite">${rangeBody(key,targetHs,sc)}</div>`}
  </section>`;
}

// ---- Category page (#/c/<id>) ----
const goalText=h=>h.type==='bool'?(h.stop?'Goal: avoid it every day':'Goal: do it every day'):h.type==='text'?(h.stop?'Write only when you slip':'Your own percentage each day'):`${h.stop?'Limit':'Goal'}: ${goalVal(h)} per day`;
const kindName=h=>h.type==='bool'?'True / false':h.type==='text'?'Text':h.type==='min'?'Time (hh:mm)':'Number';
const gripIcon='<svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true" focusable="false"><circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13" r="1.5"/><circle cx="7.5" cy="13" r="1.5"/></svg>';

function habitBlock(h,P,o){
  const k=K(P.t),sm=sumOf(h,k),ph='<div class="line ph" aria-hidden="true">&nbsp;</div>';
  const folded=isFolded('blk:'+h.id,true);
  const slot=`<div class="logrow">Today ${logHTML(h,k)}</div>`;
  const desc=o.desc?(h.desc?`<div class="line desc" title="${esc(h.desc)}">${esc(h.desc)}</div>`:ph):'';
  const sum=o.sum?(h.type!=='text'&&sm?`<div class="line sumline" title="${esc(sm)}"><span class="sumlbl">What you did:</span> ${esc(sm)}</div>`:ph):'';
  let mini='';
  if(folded){
    const off=isOff(h,k),lg=!off&&(h.done[k]>0||!!(h.skip||{})[k]);
    if(isFrozen(h,k))mini='<span class="blk-mini"><i class="pd" style="background:var(--ice)"></i>Frozen</span>';
    else if(off)mini='<span class="blk-mini"><i class="pd" style="background:var(--skip)"></i>Skipped</span>';
    else if(lg){const v=h.done[k]||0,p=pctOf(h,v,k),g=paint(p,true);
      mini=`<span class="blk-mini"><i class="pd ${g.cls}"${g.style?` style="${g.style}"`:''}></i>${pctText(p)}</span>`}
    else mini='<span class="blk-mini"><i class="pd"></i>Not logged</span>';
  }
  return `<article class="blk${folded?' folded':''}" data-id="${h.id}">
    <div class="blk-h">
      <button class="drag" type="button" data-drag="${h.id}" title="Drag to change the order" aria-label="Move ${esc(h.name)}.">${gripIcon}</button>
      <button type="button" class="ftog icon-only" data-fold="blk:${h.id}" aria-expanded="${!folded}" aria-label="${folded?'Expand':'Fold'} ${esc(h.name)}"><span class="farr" aria-hidden="true">${folded?'▸':'▾'}</span></button>
      <a class="name nm" href="${href.habit(h.id)}">${esc(h.name)}</a>
      ${mini}
      <span class="blk-btns"><button class="rm" data-archive="${h.id}" title="Hide this habit but keep its history">Archive</button></span>
    </div>
    ${folded?'':`<div class="blk-info">${streakHTML(h)}<span class="kchip${h.stop?' stop':''}">${kindName(h)} · ${h.stop?'stop':'do it'}</span>${isPeriodic(h)?`<span class="kchip per" title="How often (only a label)">${esc(freqText(h))}</span>`:''}${reqBadgeHTML(h)}<span class="goal">${goalText(h)}</span></div>
    ${desc}${sum}
    ${slot}
    ${heatmap({habits:[h],one:h,size:'large',full:true})}`}
  </article>`;
}

function progressHTML(hs,color,P){const t=todayOf(hs),dh=daily(hs);
  const wkDone=dh.reduce((a,h)=>a+count(h,P.wk,P.t),0),wkDen=dh.reduce((a,h)=>a+span(h,P.wk),0);
  const moDone=dh.reduce((a,h)=>a+count(h,P.mo,P.t),0),moDen=dh.reduce((a,h)=>a+span(h,P.mo),0);
  const stats=[['Today',pct(t.done,t.total),t.done+' of '+t.total+' habits'],['This week',pct(wkDone,wkDen),wkDone+' of '+wkDen+' check-ins'],['This month',pct(moDone,moDen),moDone+' of '+moDen+' check-ins']];
  return `<div class="sum">${stats.map(x=>`<div><span>${x[0]}</span><b>${x[1]}%</b><span>${hs.length?x[2]:'No habits yet'}</span><div class="bar"><i style="width:${x[1]}%;background:${color}"></i></div></div>`).join('')}</div>`}

const blocksHTML=(hs,P,color)=>`<div class="blocks" style="--c:${color}">${hs.map(h=>habitBlock(h,P,{desc:hs.some(x=>x.desc),sum:hs.some(x=>x.type!=='text'&&sumOf(x,K(P.t)))})).join('')}</div>`;

// Recursive nested group card: active (non-frozen) habits shown in blocks; all (including frozen) kept in heatmap & stats at the bottom
function groupCard(g,c,P,depth=0){
  const deep=sortByOrder(inGroupDeep(S.habits,S.grps,g));
  const directActive=sortByOrder(inGroup(S.habits,g)).filter(h=>!isFrozenNow(h));
  const subs=childGroups(S.grps,c.id,g.id);
  const open=!(S.shut&&S.shut[g.id]),t=todayOf(deep);
  const hmFold=isFolded('ghm:'+g.id,true);
  const body=open?`<div id="gb-${g.id}">
    <section aria-label="${esc(g.name)} progress">${progressHTML(deep,c.color,P)}
      ${deep.length?`<div class="sec-hd" style="margin-top:16px"><h2><button type="button" class="ftog" data-fold="ghm:${g.id}" aria-expanded="${!hmFold}"><span class="farr" aria-hidden="true">${hmFold?'▸':'▾'}</span> Heatmap · 20 weeks</button></h2></div>${hmFold?'':`${modeSwitch(deep,'heatG-'+g.id)}${heatmap({habits:deep,size:'large',id:'heatG-'+g.id,scope:'g:'+g.id})}${legendHTML(periodic(deep).length>0)}`}`:''}</section>
    ${directActive.length?blocksHTML(directActive,P,c.color):''}
    ${subs.map(sg=>groupCard(sg,c,P,depth+1)).join('')}
    ${deep.length||subs.length?'':'<section><p class="empty">No active habits in this group. Add or unfreeze habits in <a href="'+href.manage+'">Edit habits</a>.</p></section>'}
    ${deep.length?statsSection('g',g.id,deep):''}
  </div>`:'';
  return `<div class="grp${depth?' sub':''}" style="--c:${c.color}">
    <div class="grph"><h3 class="grpt" id="gt-${g.id}"><button type="button" class="grptog" data-grptoggle="${g.id}" aria-expanded="${open}" aria-controls="gb-${g.id}" title="${open?'Fold':'Open'}"><span aria-hidden="true">${open?'▾':'▸'}</span>${esc(g.name)}</button></h3>
      <span class="grps">${deep.length?(daily(deep).length?t.done+' of '+t.total+' done today · ':'')+deep.length+' habit'+(deep.length===1?'':'s'):'No habits yet'}</span></div>${body}</div>`}

function renderCategory(c){
  const P=periods(),hs=sortByOrder(inCat(S.habits,c.id)),topGs=childGroups(S.grps,c.id,null);
  const ownActive=loose(hs,c.id,S.grps).filter(h=>!isFrozenNow(h));
  const hmFold=isFolded('chm:'+c.id,false);
  $('page').innerHTML=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span><span aria-current="page">${esc(c.name)}</span></nav>
  <div class="sec-hd"><h2 class="dname cat-title" style="--c:${c.color}"><span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>${esc(c.name)}</h2><a class="mlink" href="${href.manage}">Edit habits</a></div>
  <section aria-label="${esc(c.name)} progress">${progressHTML(hs,c.color,P)}
    <div class="sec-hd" style="margin-top:16px"><h2><button type="button" class="ftog" data-fold="chm:${c.id}" aria-expanded="${!hmFold}"><span class="farr" aria-hidden="true">${hmFold?'▸':'▾'}</span> Heatmap · 20 weeks</button></h2></div>
    ${hmFold?'':`${modeSwitch(hs,'heatC')}${heatmap({habits:hs,size:'large',id:'heatC',scope:'c:'+c.id})}${legendHTML(periodic(hs).length>0)}`}</section>
  ${ownActive.length?blocksHTML(ownActive,P,c.color):''}
  ${topGs.map(g=>groupCard(g,c,P,0)).join('')}
  ${ownActive.length||topGs.length?'':`<section><p class="empty">No active habits here. Go to <a href="${href.manage}">Edit habits</a> to add or unfreeze habits.</p></section>`}
  ${hs.length?statsSection('c',c.id,hs):''}`;
}

// ---- Edit habits page (#/manage): Foldable base showing Category -> Nested Groups -> Habits, plus Add habit / Add category / Archived ----
export function syncAddGroups(){
  const cs=$('cat'),gsel=$('grp');if(!cs||!gsel)return;
  const tree=groupTreeList(S.grps,cs.value);
  gsel.innerHTML='<option value="">No group</option>'+tree.map(({g,depth})=>`<option value="${g.id}">${'— '.repeat(depth)+esc(g.name)}</option>`).join('');
  gsel.value=tree.some(x=>x.g.id===S.addGrp)?S.addGrp:'';
  gsel.hidden=!tree.length;
}

function manageHabitRow(h){
  const st=freezeState(h),frz=isFrozenNow(h);
  const meta=[kindName(h),h.type==='bool'||h.type==='text'?'':goalVal(h),isPeriodic(h)?freqText(h):''].filter(Boolean).join(' · ');
  return `<div class="mhab${frz?' is-frz':''}">
    <div class="mhab-main">
      <a class="mhab-name" href="${href.habit(h.id)}">${esc(h.name)}</a>
      <span class="mhab-meta">${esc(meta)}</span>
      ${frz?'<span class="mpill ice">❄ Frozen</span>':st.pending?'<span class="mpill ice">❄ Tomorrow</span>':''}
    </div>
    <div class="mhab-act">
      ${st.on||st.pending?`<button type="button" class="btn sv" data-unfreeze="${h.id}">${st.on?'Unfreeze':'Cancel'}</button>`:`<button type="button" class="btn alt sv" data-freeze="${h.id}">❄ Freeze</button>`}
      <button type="button" class="rm" data-archive="${h.id}">Archive</button>
    </div>
  </div>`;
}

function manageGroupNode(g,c,i,sibCount,depth=0){
  const direct=sortByOrder(inGroup(S.habits,g));
  const deep=inGroupDeep(S.habits,S.grps,g);
  const subs=childGroups(S.grps,c.id,g.id);
  const folded=isFolded('mgrp:'+g.id,true);
  const edOpen=!isFolded('mgrp-ed:'+g.id,true);
  const cnt=deep.length;
  const editBar=edOpen?`<div class="medbar">
    <div class="medrow">
      <input class="mname" data-gname="${g.id}" value="${esc(g.name)}" maxlength="40" aria-label="Rename group">
      <button type="button" class="btn alt sv" data-grpup="${g.id}" ${i===0?'disabled':''} aria-label="Move up">↑</button>
      <button type="button" class="btn alt sv" data-grpdown="${g.id}" ${i===sibCount-1?'disabled':''} aria-label="Move down">↓</button>
      <button type="button" class="rm" data-grpdel="${g.id}">Delete</button>
    </div>
    <form class="addgrp" data-gcat="${c.id}">
      <input type="hidden" name="parent" value="${g.id}">
      <input name="gname" maxlength="40" placeholder="New sub-group inside ${esc(g.name)}…" aria-label="New sub-group name" required>
      <button class="btn alt sv">+ Sub-group</button>
    </form>
  </div>`:'';

  return `<div class="mgrp${depth?' sub':''}">
    <div class="mgrp-h">
      <button type="button" class="ftog" data-fold="mgrp:${g.id}" aria-expanded="${!folded}">
        <span class="farr" aria-hidden="true">${folded?'▸':'▾'}</span>
        <span class="mgrp-title">${esc(g.name)}</span>
        <span class="mpill">${cnt}</span>
      </button>
      <span class="mnode-act">
        <button type="button" class="btn alt sv" data-maddhabit="${c.id}|${g.id}" title="Add a habit inside ${esc(g.name)}">+ Habit</button>
        <button type="button" class="btn alt sv" data-fold="mgrp-ed:${g.id}" aria-expanded="${edOpen}">${edOpen?'Done':'Edit'}</button>
      </span>
    </div>
    ${editBar}
    ${folded?'':`<div class="mgrp-b">
      ${direct.length?`<div class="mhab-list">${direct.map(manageHabitRow).join('')}</div>`:''}
      ${subs.map((sg,si)=>manageGroupNode(sg,c,si,subs.length,depth+1)).join('')}
      ${!direct.length&&!subs.length?'<p class="hint" style="margin:6px 0 2px">No habits in this group yet.</p>':''}
    </div>`}
  </div>`;
}

function manageCatCard(c,i,n){
  const allLive=sortByOrder(inCat(S.habits,c.id));
  const frzCount=allLive.filter(isFrozenNow).length;
  const actCount=allLive.length-frzCount;
  const own=loose(allLive,c.id,S.grps);
  const topGrps=childGroups(S.grps,c.id,null);
  const tree=groupTreeList(S.grps,c.id);
  const folded=isFolded('mcat:'+c.id,true);
  const edOpen=!isFolded('mcat-ed:'+c.id,true);

  const allWithArch=S.habits.filter(h=>h.cat===c.id),arch=allWithArch.filter(h=>h.archived).length,others=S.cats.filter(x=>x.id!==c.id);
  let delPanel='';
  if(S.delCat===c.id){
    if(!others.length)delPanel=`<div class="delpanel" role="alert">You need at least one category. <button type="button" class="btn alt sv" data-catdelcancel="1">OK</button></div>`;
    else if(!allWithArch.length)delPanel=`<div class="delpanel" role="alert">Delete “${esc(c.name)}”? <button type="button" class="btn sv" data-catdelgo="${c.id}">Delete category</button><button type="button" class="btn alt sv" data-catdelcancel="1">Cancel</button></div>`;
    else delPanel=`<div class="delpanel" role="alert"><span>“${esc(c.name)}” has ${allWithArch.length} habit${allWithArch.length===1?'':'s'}${arch?` (${arch} archived)`:''}. Move them to</span>
      <select id="delTarget" aria-label="Move habits to">${others.map(o=>`<option value="${o.id}">${esc((o.icon?o.icon+' ':'')+o.name)}</option>`).join('')}</select>
      <button type="button" class="btn sv" data-catdelgo="${c.id}">Move &amp; delete</button><button type="button" class="btn alt sv" data-catdelcancel="1">Cancel</button></div>`;
  }

  const editBar=edOpen?`<div class="medbar">
    <div class="medrow">
      <input type="color" class="mcolor" data-ccolor="${c.id}" value="${c.color}" aria-label="Colour for ${esc(c.name)}">
      <input class="micon" data-cicon="${c.id}" value="${esc(c.icon||'')}" maxlength="8" placeholder="🙂" aria-label="Icon for ${esc(c.name)}">
      <input class="mname" data-cname="${c.id}" value="${esc(c.name)}" maxlength="40" aria-label="Name of category">
      <button type="button" class="btn alt sv" data-catup="${c.id}" ${i===0?'disabled':''} aria-label="Move up">↑</button>
      <button type="button" class="btn alt sv" data-catdown="${c.id}" ${i===n-1?'disabled':''} aria-label="Move down">↓</button>
      <button type="button" class="rm" data-catdel="${c.id}">Delete</button>
    </div>
    <form class="addgrp" data-gcat="${c.id}">
      <input name="gname" maxlength="40" placeholder="New group in ${esc(c.name)}, e.g. Wird…" aria-label="New group name" required>
      ${tree.length?`<select name="parent" aria-label="Parent group"><option value="">Top level</option>${tree.map(({g,depth})=>`<option value="${g.id}">Inside: ${'— '.repeat(depth)+esc(g.name)}</option>`).join('')}</select>`:''}
      <button class="btn alt sv">+ Add group</button>
    </form>
    ${delPanel}
  </div>`:delPanel;

  const badge=frzCount?`${actCount} active · ${frzCount} frozen`:`${allLive.length} habit${allLive.length===1?'':'s'}`;

  return `<article class="mcat${folded?' folded':''}" style="--c:${c.color}">
    <div class="mcat-h">
      <button type="button" class="ftog mcat-tog" data-fold="mcat:${c.id}" aria-expanded="${!folded}">
        <span class="farr" aria-hidden="true">${folded?'▸':'▾'}</span>
        <span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>
        <span class="mcat-name">${esc(c.name)}</span>
        <span class="mpill">${badge}</span>
      </button>
      <span class="mnode-act">
        <button type="button" class="btn alt sv" data-maddhabit="${c.id}|" title="Add a habit to ${esc(c.name)}">+ Habit</button>
        <button type="button" class="btn alt sv" data-fold="mcat-ed:${c.id}" aria-expanded="${edOpen}">${edOpen?'Done':'Edit'}</button>
      </span>
    </div>
    ${editBar}
    ${folded?'':`<div class="mcat-b">
      ${own.length?`<div class="mhab-list">${own.map(manageHabitRow).join('')}</div>`:''}
      ${topGrps.map((g,gi)=>manageGroupNode(g,c,gi,topGrps.length,0)).join('')}
      ${!own.length&&!topGrps.length?'<p class="hint" style="margin:6px 0 2px">No habits in this category yet. Click “+ Habit” above.</p>':''}
    </div>`}
  </article>`;
}

function renderManage(){
  const arch=S.habits.filter(h=>h.archived),msg=S.catMsg||'';S.catMsg='';
  const addOpen=!isFolded('m:add',true);
  const addCatFold=isFolded('m:addcat',true);
  const archFold=isFolded('m:arch',true);
  const catName=h=>{const c=S.cats.find(x=>x.id===h.cat);const gp=h.grp?groupPath(S.grps,h.grp):'';return (c?c.name:'No category')+(gp?' › '+gp:'')};

  $('page').innerHTML=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span><span aria-current="page">Edit habits</span></nav>
  <div class="sec-hd">
    <h2 class="dname" style="margin:0">Edit habits</h2>
    <span class="foldtools">
      <button type="button" class="btn alt sv" data-mfoldall="1">Fold all</button>
      <button type="button" class="btn alt sv" data-mfoldall="0">Expand all</button>
    </span>
  </div>
  <div class="mtoolbar">
    <button type="button" class="btn sv" data-fold="m:add" aria-expanded="${addOpen}">${addOpen?'Hide “Add habit”':'+ Add habit'}</button>
    <button type="button" class="btn alt sv" data-fold="m:addcat" aria-expanded="${!addCatFold}">${addCatFold?'+ Add category':'Hide “Add category”'}</button>
    ${msg?`<span class="uns" role="status">${esc(msg)}</span>`:''}
  </div>
  ${addCatFold?'':`<section class="maddcat" aria-labelledby="acT"><h2 id="acT">Add a category</h2>
    <form id="addcat"><input type="color" class="mcolor" id="newCatColor" value="${nextColor(S.cats)}" aria-label="Colour"><input class="micon" id="newCatIcon" maxlength="8" placeholder="🙂" aria-label="Icon"><input id="newCatName" class="mname" maxlength="40" placeholder="New category, e.g. Fitness" required><button class="btn">Add category</button></form></section>`}
  <div class="mtree" aria-label="Categories, groups and habits">
    ${S.cats.map((c,i)=>manageCatCard(c,i,S.cats.length)).join('')}
  </div>
  <section class="march" aria-labelledby="arT">
    <div class="sec-hd" style="margin:0">
      <h2 id="arT"><button type="button" class="ftog" data-fold="m:arch" aria-expanded="${!archFold}"><span class="farr" aria-hidden="true">${archFold?'▸':'▾'}</span> Archived habits <span class="mpill">${arch.length}</span></button></h2>
    </div>
    ${archFold?'':`<div class="march-b">${arch.length?arch.map(h=>`<div class="mhab"><div class="mhab-main"><a class="mhab-name" href="${href.habit(h.id)}">${esc(h.name)}</a><span class="mhab-meta">${esc(catName(h))}</span></div><div class="mhab-act"><button type="button" class="btn alt sv" data-restore="${h.id}">Restore</button><button type="button" class="rm" data-rm="${h.id}">Delete forever</button></div></div>`).join(''):'<p class="empty" style="margin-top:8px">Nothing archived.</p>'}</div>`}
  </section>`;
  $('addT').textContent='Add a habit';
  syncAddGroups();
}

function reqBadgeHTML(h){
  const rs=reqStreaks(h);if(!rs||!rs.current)return '';
  const c=rs.current;
  if(c.skipped)return `<span class="kchip rq-skip" title="Skipped: ${esc(c.skipReason)}">Req skipped</span>`;
  if(c.wellDone)return `<span class="kchip rq-ok">Well done ✓ (${c.done}/${c.req.x})</span>`;
  return `<span class="kchip rq-prog">Req: ${c.done}/${c.req.x}</span>`;
}

function reqSectionHTML(h){
  const rs=reqStreaks(h);if(!rs)return '';
  const foldKey='hrq:'+h.id,folded=isFolded(foldKey,true);
  const recent=[...rs.periods].reverse().slice(0,12);
  const rows=recent.map(p=>{
    const st=p.skipped?`<span class="dbadge">Skipped${p.skipReason?' · '+esc(p.skipReason):''}</span>`
      :p.wellDone?`<span class="dbadge rq-ok">Well done ✓</span>`
      :!p.complete?`<span class="dbadge">${p.canStillMeet?'In progress':'Missed'}</span>`
      :`<span class="dbadge rq-miss">Missed</span>`;
    const btn=p.skipped
      ?`<button type="button" class="btn alt sv" data-rqunskip="${h.id}|${p.key}">Undo skip</button>`
      :`<button type="button" class="btn alt sv" data-rqskip="${h.id}|${p.key}">Skip req</button>`;
    return `<div class="rqrow"><span><b>${esc(fmt(p.start))} – ${esc(fmt(p.end))}</b> · ${p.done}/${p.req.x} days (${esc(reqText(p.req))})</span><span class="mbtns">${st}${btn}</span></div>`;
  }).join('');
  return `<div class="rqbox">
    <div class="rqstreaks">
      <span class="rqst">Done-days streak: <b>${rs.doneDays}</b> day${rs.doneDays===1?'':'s'}</span>
      <span class="rqst">All-days streak: <b>${rs.allDays}</b> day${rs.allDays===1?'':'s'}</span>
      ${rs.totalComplete?`<span class="rqst">Well done: <b>${rs.wellDoneCount}/${rs.totalComplete}</b> periods</span>`:''}
    </div>
    <div class="sec-hd" style="margin:8px 0 4px">
      <button type="button" class="ftog sm" data-fold="${foldKey}" aria-expanded="${!folded}"><span class="farr" aria-hidden="true">${folded?'▸':'▾'}</span> Required periods &amp; Skip req (${rs.periods.length})</button>
    </div>
    ${folded?'':`<div class="rqlist">${rows}</div>`}
  </div>`;
}

function renderCode(){
  const text=S.codeDraft!==undefined&&S.codeDraft!==null?S.codeDraft:exportCodeDB(S);
  const errs=S.codeErrors||[];
  const msg=S.codeMsg||'';
  $('page').innerHTML=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span><span aria-current="page">Code DB</span></nav>
  <h2 class="dname">Code DB</h2>
  <section class="codedb-sec">
    <p class="hint">Edit your entire database as plain text (Minimal YAML-like). Latest dates are at the top; config is at the bottom. Nothing is saved if there is a syntax error.</p>
    <div class="dayrow">
      <button type="button" class="btn" data-codeapply="1">Apply &amp; Sync</button>
      <button type="button" class="btn alt sv" data-codereset="1">Reset to current DB</button>
      <span class="uns" role="status">${esc(msg)}</span>
    </div>
    ${errs.length?`<div class="codeerr" role="alert"><b>Fix ${errs.length} error${errs.length===1?'':'s'} before saving:</b><ul>${errs.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>`:''}
    <textarea id="codeEditor" class="codeed" spellcheck="false" aria-label="Habit tracker code database">${esc(text)}</textarea>
  </section>`;
}

function renderMissing(what){
  $('page').innerHTML=`<section><nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a></nav><h2>${what} not found</h2><p class="empty">It may have been removed or hasn't loaded yet. <a href="${href.home}">Back to Home</a></p></section>`}

function renderMain(){
  const R=parseHash(),legacy=S.habits.some(h=>h.notes&&Object.keys(h.notes).length),needGl=S.habits.some(needsGoalLog),countNts=()=>S.habits.reduce((a,h)=>a+Object.keys(h.nts||{}).length,0),n0=countNts();
  S.habits.forEach(h=>{norm(h);pruneEmpty(h,R.name==='habit'&&R.id===h.id?S.day:R.name==='day'?R.id:null)});
  const fz=S.habits.reduce((a,h)=>extendFreeze(h)||a,false);
  if(legacy||countNts()!==n0||fz||needGl)save();
  const P=periods(),H=S.habits,need=unassigned(H,S.cats);
  $('date').textContent=P.t.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const show=(...ids)=>['assign','home','page','add','detail'].forEach(i=>{$(i).hidden=!ids.includes(i);if(i!=='add'&&!ids.includes(i))$(i).innerHTML=''});
  S.open=null;document.title='Habit tracker';if(R.name!=='habit')S.goalFrom=null;
  if(need.length){renderAssign(need);show('assign');return}
  const cs=$('cat'),cur=cs.value;cs.hidden=false;cs.innerHTML=S.cats.map(c=>`<option value="${c.id}">${esc((c.icon?c.icon+' ':'')+c.name)}</option>`).join('');if(S.cats.some(c=>c.id===cur))cs.value=cur;
  if(R.name==='habit'){const h=H.find(x=>x.id===R.id);
    if(h){S.open=h.id;document.title=h.name+' · Habit tracker';renderDetail(h);show('detail')}
    else{renderMissing('Habit');show('page')}}
  else if(R.name==='manage'){document.title='Edit habits · Habit tracker';renderManage();if(!isFolded('m:add',true))show('page','add');else show('page')}
  else if(R.name==='code'){document.title='Code DB · Habit tracker';renderCode();show('page')}
  else if(R.name==='day'){if(!renderDay(R.id))renderMissing('Day');show('page')}
  else if(R.name==='cat'){const c=S.cats.find(x=>x.id===R.id);
    if(c){document.title=c.name+' · Habit tracker';renderCategory(c);show('page')}
    else{renderMissing('Category');show('page')}}
  else{renderHome();show('home')}
}

export function renderNotes(h){const box=$('notelist');if(!box)return;const ds=[...textDays(h)].sort().reverse();
  box.innerHTML=ds.length?ds.map(k=>{const sm=sumOf(h,k),ns=dayNotes(h,k).filter(n=>n.t.trim());
    return `<button class="nt" data-day="${k}"><b>${fmt(k)}</b>${sm?`<span class="ntsum">${esc(sm)}</span>`:''}${ns.map(n=>`<span>${esc(n.t)}</span>`).join('')}</button>`}).join(''):'<p class="empty">Nothing written yet.</p>'}

function noteRow(n,i,len,text){const at=n.at?new Date(n.at):null,
  time=at?`<span class="ntat" title="Added ${esc(at.toLocaleString())}">${esc(at.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</span>`:'';
  return `<li class="ntrow"><div class="nthead"><label for="nt-${n.id}">Note ${i+1}</label>${time}<span class="ntbtns">
    <button class="btn alt sv" data-ntup="${n.id}" ${i===0?'disabled':''} aria-label="Move note ${i+1} up">↑</button><button class="btn alt sv" data-ntdown="${n.id}" ${i===len-1?'disabled':''} aria-label="Move note ${i+1} down">↓</button><button class="rm" data-ntdel="${n.id}" aria-label="Delete note ${i+1}">Delete</button></span></div>
    <textarea id="nt-${n.id}" data-nt="${n.id}" rows="3" placeholder="Write a note…">${esc(text)}</textarea></li>`}

function renderDetail(h){
  const k=S.day||K(T());S.day=k;const cat=S.cats.find(c=>c.id===h.cat),tree=groupTreeList(S.grps,h.cat),
    dr=S.noteDraft&&S.noteDraft.k===k?S.noteDraft:null,ns=dayNotes(h,k),
    t=K(T()),gf=S.goalFrom&&S.goalFrom.id===h.id?S.goalFrom.k:t,hist=goalHistory(h),
    f=isPeriodic(h)?cleanFreq(h.fq):null,isM=h.type==='min';

  const hmFold=isFolded('hhm:'+h.id,false),edFold=isFolded('hed:'+h.id,false),prFold=isFolded('hpr:'+h.id,true),anFold=isFolded('han:'+h.id,true);
  const histLine=hist.length>1?`<div class="hint" style="margin:4px 0 0">${hist.map(([d,g])=>`${esc(fmt(d))}: <b>${isM?fmtHHMM(g):g+(h.unit?' '+esc(h.unit):'')}</b>`).join(' · ')}</div>`:'';

  const propsTable=`<table class="ptbl"><tbody>
    <tr><th>Name</th><td><div class="row"><input id="nameIn" value="${esc(h.name)}" maxlength="60"><button class="btn sv" data-rename="1">Rename</button></div></td></tr>
    <tr><th>Type</th><td><span class="hint" style="margin:0">${typeLabel(h)}</span></td></tr>
    <tr><th>Category</th><td><div class="row">
      <select id="moveCat">${S.cats.map(c=>`<option value="${c.id}"${c.id===h.cat?' selected':''}>${esc((c.icon?c.icon+' ':'')+c.name)}</option>`).join('')}</select>
      ${tree.length?`<select id="moveGrp" aria-label="Group"><option value="">No group</option>${tree.map(({g})=>`<option value="${g.id}"${g.id===h.grp?' selected':''}>${esc(groupPath(S.grps,g.id))}</option>`).join('')}</select>`:''}
      ${h.archived?'':`<button class="btn alt sv" data-archive="${h.id}">Archive</button>`}
    </div></td></tr>
    ${h.type==='bool'||h.type==='text'?'':`<tr><th>${h.stop?'Limit':'Goal'}</th><td><div class="row">
      <input ${isM?'type="text" inputmode="numeric" placeholder="hh:mm"':'type="number" min="0" step="any"'} id="goalAmt" value="${isM?fmtHHMM(goalOn(h,gf)):goalOn(h,gf)}" style="width:90px">
      ${isM?'':`<input id="unitIn" value="${esc(h.unit)}" maxlength="24" style="width:110px" aria-label="Unit">`}
      <span class="hint" style="margin:0">from</span>
      <input type="date" id="goalFrom" value="${gf}" min="${h.created}" max="${t}" aria-label="Applies from">
    </div>${histLine}</td></tr>`}
    ${(()=>{const rf=S.reqFrom&&S.reqFrom.id===h.id?S.reqFrom.k:t,curR=reqOn(h,rf),rHist=reqHistory(h);
    const rHistLine=rHist.length?`<div class="hint" style="margin:4px 0 0">${rHist.map(([d,r])=>`${esc(fmt(d))}: <b>${esc(reqText(r))}</b> <button type="button" class="rm" data-rqdel="${d}" title="Remove this entry">×</button>`).join(' · ')}</div>`:'';
    return `<tr><th>Required days</th><td><div class="row">
      <input type="number" id="rqX" min="1" max="365" value="${curR?curR.x:''}" placeholder="X" style="width:64px" aria-label="Required days X">
      <span class="hint" style="margin:0">/</span>
      <select id="rqPer" aria-label="Required period"><option value=""${!curR?' selected':''}>None</option><option value="week"${curR&&curR.per==='week'?' selected':''}>week</option><option value="month"${curR&&curR.per==='month'?' selected':''}>month</option><option value="days"${curR&&curR.per==='days'?' selected':''}>Y days</option></select>
      ${curR&&curR.per==='days'?`<input type="number" id="rqY" min="1" max="365" value="${curR.y}" placeholder="Y" style="width:64px" aria-label="Period length Y days">`:''}
      <span class="hint" style="margin:0">from</span>
      <input type="date" id="rqFrom" value="${rf}" min="${h.created}" max="${t}" aria-label="Required days from">
      <button type="button" class="btn alt sv" data-rqsave="1">Set</button>
    </div>${rHistLine}</td></tr>`})()}
    <tr><th>Importance</th><td><select id="impIn">${IMPS.map((n,i)=>`<option value="${i+1}"${imp(h)===i+1?' selected':''}>${i+1} · ${n}</option>`).join('')}</select></td></tr>
    ${h.stop?'':`<tr><th>How often</th><td><div class="row">
      <select id="fqMode"><option value=""${f?'':' selected'}>Every day</option><option value="p"${f?' selected':''}>Periodic</option></select>
      ${f?`<input type="number" id="fqN" min="1" max="${f.per==='days'?365:99}" value="${f.n}" style="width:70px"><select id="fqPer">${FQ_OPTS.map(o=>`<option value="${o[0]}"${f.per===o[0]?' selected':''}>${o[1]}</option>`).join('')}</select>`:''}
    </div></td></tr>`}
    <tr><th>Description</th><td><textarea id="desc" rows="1" placeholder="Optional">${esc(h.desc||'')}</textarea></td></tr>
  </tbody></table>`;

  $('detail').innerHTML=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span>${cat?`<a href="${href.cat(cat.id)}">${esc(cat.name)}</a><span aria-hidden="true">›</span>`:''}<span aria-current="page">${esc(h.name)}</span></nav>
  <h2 class="dname">${esc(h.name)}</h2>
  <div class="meta">${streakHTML(h)}<span>${isPeriodic(h)?'Checked':'Done'} <b>${Object.keys(h.done).length}</b> days</span>${isPeriodic(h)?`<span class="kchip per">${esc(freqText(h))}</span>`:''}</div>
  ${reqSectionHTML(h)}
  ${frzBanner(h)}
  ${h.archived?`<div class="archbanner" role="status"><span>Archived</span><button class="btn sv" data-restore="${h.id}">Restore</button></div>`:''}

  <div class="sec-hd" style="margin-top:14px"><h2><button type="button" class="ftog" data-fold="hhm:${h.id}" aria-expanded="${!hmFold}"><span class="farr" aria-hidden="true">${hmFold?'▸':'▾'}</span> Heatmap</button></h2></div>
  ${hmFold?'':`${heatmap({habits:S.habits,one:h,size:'large',id:'heatH'})}${legendHTML()}`}

  <div class="sec-hd" style="margin-top:16px"><h2><button type="button" class="ftog" data-fold="hed:${h.id}" aria-expanded="${!edFold}"><span class="farr" aria-hidden="true">${edFold?'▸':'▾'}</span> Edit day</button></h2></div>
  ${edFold?'':`<div class="dayrow"><input type="date" id="dayPick" value="${k}" max="${t}">${logHTML(h,k,false)}</div>
  ${h.type==='bool'||h.type==='text'?'':`<p class="hint">${h.stop?'Limit':'Goal'} on ${fmt(k)}: <b>${goalVal(h,k)}</b></p>`}
  <p class="hint">${levelHint(h)}</p>
  <label for="sum">${h.type==='text'?`Text for ${fmt(k)}`:`What did you do? (${fmt(k)})`}</label>
  <textarea id="sum" rows="3" placeholder="Optional…">${esc(dr&&dr.sum!==undefined?dr.sum:sumOf(h,k))}</textarea>
  <div class="noteshead"><span class="lbl">Notes for ${fmt(k)}</span><span class="ntbtns"><button class="btn alt sv" data-ntadd="1">+ Add note</button>${isManual(h,k)?'<button class="btn alt sv" data-ntreset="1">Sort by date</button>':''}</span></div>
  ${ns.length?`<ul class="ntrows">${ns.map((n,i)=>noteRow(n,i,ns.length,dr&&dr.v&&dr.v[n.id]!==undefined?dr.v[n.id]:n.t)).join('')}</ul>`:'<p class="empty" style="margin-bottom:12px">No notes for this day.</p>'}
  <div class="dayrow"><button class="btn" data-saveday="1">Save day</button><span id="savestate" role="status">${S.saved?'Saved ✓':''}</span></div>`}

  <div class="sec-hd" style="margin-top:18px"><h2><button type="button" class="ftog" data-fold="hpr:${h.id}" aria-expanded="${!prFold}"><span class="farr" aria-hidden="true">${prFold?'▸':'▾'}</span> Properties</button></h2></div>
  ${prFold?'':propsTable}

  <div class="sec-hd" style="margin-top:18px"><h2><button type="button" class="ftog" data-fold="han:${h.id}" aria-expanded="${!anFold}"><span class="farr" aria-hidden="true">${anFold?'▸':'▾'}</span> All notes</button></h2></div>
  ${anFold?'':'<div id="notelist"></div>'}

  ${statsSection('h',h.id,[h])}`;
  if(!anFold)renderNotes(h)}

export function render(){
  hidePop();renderMain();
  document.querySelectorAll('.heat').forEach(rove)}
