// Turns state into HTML: picks the page from the address (Home, Category, Habit) and builds the habit detail view.
import {S} from './state.js';
import {$,K,T,esc,fmt,pct} from './util.js';
import {isOff,streak,best,count,span,todayOf,txtAmt,typeLabel,LN,periods,levelOf,levelAmt,norm} from './scoring.js';
import {heatmap,legendHTML,hidePop,rove} from './heatmap.js';
import {unassigned,inCat,nextColor} from './categories.js';
import {parseHash,href} from './router.js';
import {renderHome} from './home.js';

export function levelHint(h){
  if(h.type==='bool')return h.stop?'Choose one and press Save. A day left empty counts as "Avoided it".':'Choose one and press Save. A day left empty counts as "Not done".';
  if(h.stop)return 'Best = none · Better = up to half your limit · Normal = up to your limit · Low = up to 1.5× · Lowest = up to 2× · None = more than 2×. A day left empty counts as 0.';
  return 'Lowest = under half your goal · Low = half · Normal = your goal · Better = 1.5× · Best = 2×. Leave the box empty for "not logged" (counts as 0), or press the dark red square to record a skipped day.'}
function goalEditor(h){
  const head=`<p class="hint" style="margin-top:14px">${typeLabel(h)}</p>`;
  if(h.type==='bool')return head;
  return head+`<label for="goalAmt">${h.stop?'Daily limit':'Daily goal'}</label>
  <div class="dayrow"><input type="number" id="goalAmt" min="0" step="any" value="${h.goal}" style="flex:0 0 110px"><input id="unitIn" value="${esc(h.unit)}" maxlength="24" style="flex:0 0 150px" aria-label="Unit"></div>`}

// Streak badge: the flame grows and glows as the streak gets longer
function streakHTML(h){const n=streak(h),bst=best(h),tier=n>=30?4:n>=14?3:n>=7?2:n>=3?1:n>=1?0:-1;
  const risk=n&&!isOff(h,K(T()))&&!(h.done[K(T())]>0||(h.skip||{})[K(T())])?'<span class="risk">Log today to keep it going</span>':'';
  if(tier<0)return `<span class="streak s-off"><span class="flame">🔥</span>No streak yet</span><span>Best <b>${bst}</b></span>`;
  return `<span class="streak s${tier}" title="Best streak: ${bst} days"><span class="flame">🔥</span><b>${n}</b> day${n===1?'':'s'}</span><span>Best <b>${bst}</b></span>${risk}`}
function logHTML(h,k,sv=true){const dk=h.id+'|'+k,cur=h.done[k]>0?h.done[k]:((h.skip||{})[k]?0:null),
  dirty=!!S.draft&&dk in S.draft&&S.draft[dk]!==cur,v=dirty?S.draft[dk]:cur,u=esc(h.unit),
  grp=esc(h.name)+', '+(k===K(T())?'today':fmt(k));   // names the group of controls for screen readers
  if(isOff(h,k))return `<span class="log"><span class="skipbadge">Skipped · ${esc(h.off[k]||'no reason')}</span><button class="btn alt sv" data-unskip="${dk}">Undo skip</button></span>`;
  if(S.skipFor===dk)return `<span class="log skippanel"><select class="skipReason" aria-label="Reason">${['Ill','Travel','Rest','Busy','Other…'].map(r=>`<option>${r}</option>`).join('')}</select><input class="skipCustom" placeholder="Reason" maxlength="40" hidden aria-label="Custom reason"><button class="btn sv" data-skipgo="${dk}">Skip this day</button><button class="btn alt sv" data-skipcancel="1">Cancel</button></span>`;
  const tail=(sv?`<button class="btn sv" data-save="${dk}">Save</button>`:'')+`<button class="btn alt sv" data-skipopen="${dk}">Skip day</button><span class="uns">${dirty?'Unsaved':''}</span></span>`;
  if(h.type==='bool'){const opts=h.stop?[[0,'Avoided it',5],[1,'Slipped',0]]:[[1,'Done',5],[0,'Not done',0]];
    return `<span class="log" role="group" aria-label="${grp}">`+opts.map(o=>`<button class="bt l${o[2]}" data-bool="${dk}|${o[0]}" aria-pressed="${v!==null&&v===o[0]}">${o[1]}</button>`).join('')+tail}
  const lv=v===null?-1:levelOf(h,v);
  return `<span class="log" role="group" aria-label="${grp}"><input type="number" min="0" step="any" inputmode="decimal" value="${v===null?'':v}" placeholder="0" data-amt="${dk}" aria-label="${u} done"><span>${u}</span>`+
  LN.map((nm,i)=>`<button class="lv l${i}" data-lvl="${dk}|${i}" aria-pressed="${i===lv}" title="${nm} (${levelAmt(h,i)} ${u})" aria-label="${nm} (${levelAmt(h,i)} ${u})"></button>`).join('')+
  `<span class="lvname">${lv<0?(k===K(T())?'Not logged yet':'Not logged'):LN[lv]}</span>`+tail}

// One-time screen: every habit without a (valid) category must be sorted into one
function renderAssign(need){const d=S.assignDraft||{};
  const opts=sel=>'<option value="">Choose…</option>'+S.cats.map(c=>`<option value="${c.id}"${sel===c.id?' selected':''}>${esc((c.icon?c.icon+' ':'')+c.name)}</option>`).join('');
  $('assign').innerHTML=`<h2>Sort your habits into categories</h2>
  <p class="hint">Pick a category for each habit. Nothing is deleted, and you can change a category later.</p>
  <div class="dayrow"><label for="assignAll">Set all to</label><select id="assignAll" aria-label="Set all habits to a category">${opts('')}</select></div>
  ${need.map(h=>`<div class="assignrow"><span class="name">${esc(h.name)}</span><select data-assign="${h.id}" aria-label="Category for ${esc(h.name)}">${opts(d[h.id])}</select></div>`).join('')}
  <div class="dayrow"><button class="btn" data-assignsave="1">Save categories</button><span id="assignmsg" class="uns" role="status"></span></div>`}
// ---- Category page (#/c/<id>) ----
const goalText=h=>h.type==='bool'?(h.stop?'Goal: avoid it every day':'Goal: do it every day'):`${h.stop?'Limit':'Goal'}: ${h.goal} ${esc(h.unit)} per day`;
// One habit block: name (opens the habit page), streak flame, description, goal, quick log for today, small heatmap
function habitBlock(h,P){
  return `<article class="blk"><div class="blk-h"><a class="name nm" href="${href.habit(h.id)}">${esc(h.name)}</a><button class="rm" data-archive="${h.id}" title="Hide this habit but keep its history">Archive</button></div>
  ${h.desc?`<div class="desc">${esc(h.desc)}</div>`:''}
  <div class="meta">${streakHTML(h)}</div>
  <div class="goal">${goalText(h)}</div>
  <div class="logrow">Today ${logHTML(h,K(P.t))}</div>
  ${heatmap({habits:[h],one:h,size:'small'})}</article>`}
function renderCategory(c){
  const P=periods(),hs=inCat(S.habits,c.id),t=todayOf(hs);
  const wkDone=hs.reduce((a,h)=>a+count(h,P.wk,P.t),0),wkDen=hs.reduce((a,h)=>a+span(h,P.wk),0);
  const moDone=hs.reduce((a,h)=>a+count(h,P.mo,P.t),0),moDen=hs.reduce((a,h)=>a+span(h,P.mo),0);
  const stats=[['Today',pct(t.done,t.total),t.done+' of '+t.total+' habits'],['This week',pct(wkDone,wkDen),wkDone+' of '+wkDen+' check-ins'],['This month',pct(moDone,moDen),moDone+' of '+moDen+' check-ins']];
  $('page').innerHTML=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span><span aria-current="page">${esc(c.name)}</span></nav>
  <h2 class="dname cat-title" style="--c:${c.color}"><span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>${esc(c.name)}</h2>
  <section aria-label="${esc(c.name)} progress"><div class="sum">${stats.map(x=>`<div><span>${x[0]}</span><b>${x[1]}%</b><span>${hs.length?x[2]:'No habits yet'}</span><div class="bar"><i style="width:${x[1]}%;background:${c.color}"></i></div></div>`).join('')}</div>
    <h2 style="margin-top:18px">Heatmap · 20 weeks</h2>${heatmap({habits:hs,size:'medium',id:'heatC'})}${legendHTML()}</section>
  ${hs.length?`<div class="blocks">${hs.map(h=>habitBlock(h,P)).join('')}</div>`:'<section><p class="empty">No habits in this category yet. Add your first one below. Name it by the action, like “Walk 30 minutes”.</p></section>'}`;
  $('addT').textContent='Add a habit to '+c.name}
// ---- Manage page (#/manage): categories and archived habits ----
function catRow(c,i,n){
  const all=S.habits.filter(h=>h.cat===c.id),arch=all.filter(h=>h.archived).length,others=S.cats.filter(x=>x.id!==c.id);
  let panel='';
  if(S.delCat===c.id){
    if(!others.length)panel=`<div class="delpanel" role="alert">You need at least one category, so this one cannot be deleted. <button class="btn alt sv" data-catdelcancel="1">OK</button></div>`;
    else if(!all.length)panel=`<div class="delpanel" role="alert">Delete “${esc(c.name)}”? It has no habits. <button class="btn sv" data-catdelgo="${c.id}">Delete category</button><button class="btn alt sv" data-catdelcancel="1">Cancel</button></div>`;
    else panel=`<div class="delpanel" role="alert"><span>“${esc(c.name)}” has ${all.length} habit${all.length===1?'':'s'}${arch?` (${arch} archived)`:''}. Nothing is deleted: they move to</span>
      <select id="delTarget" aria-label="Move habits to">${others.map(o=>`<option value="${o.id}">${esc((o.icon?o.icon+' ':'')+o.name)}</option>`).join('')}</select>
      <button class="btn sv" data-catdelgo="${c.id}">Move habits and delete category</button><button class="btn alt sv" data-catdelcancel="1">Cancel</button></div>`}
  return `<li class="mrow" style="--c:${c.color}">
    <div class="mline"><input type="color" class="mcolor" data-ccolor="${c.id}" value="${c.color}" aria-label="Colour for ${esc(c.name)}">
    <input class="micon" data-cicon="${c.id}" value="${esc(c.icon||'')}" maxlength="8" placeholder="🙂" aria-label="Icon for ${esc(c.name)}">
    <input class="mname" data-cname="${c.id}" value="${esc(c.name)}" maxlength="40" aria-label="Name of category ${i+1}"></div>
    <div class="mbtns"><button class="btn alt sv" data-catup="${c.id}" ${i===0?'disabled':''} aria-label="Move ${esc(c.name)} up">↑ Up</button><button class="btn alt sv" data-catdown="${c.id}" ${i===n-1?'disabled':''} aria-label="Move ${esc(c.name)} down">↓ Down</button><button class="rm" data-catdel="${c.id}">Delete</button></div>${panel}</li>`}
function renderManage(){
  const arch=S.habits.filter(h=>h.archived),msg=S.catMsg||'';S.catMsg='';
  $('page').innerHTML=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span><span aria-current="page">Manage categories</span></nav>
  <h2 class="dname">Manage categories</h2>
  <section aria-labelledby="mcT"><h2 id="mcT">Your categories</h2><p class="hint">Edit a name, icon or colour right here. The order below is the order on Home.</p>
    <ul class="mrows">${S.cats.map((c,i)=>catRow(c,i,S.cats.length)).join('')}</ul></section>
  <section aria-labelledby="acT"><h2 id="acT">Add a category</h2>
    <form id="addcat"><input type="color" class="mcolor" id="newCatColor" value="${nextColor(S.cats)}" aria-label="Colour"><input class="micon" id="newCatIcon" maxlength="8" placeholder="🙂" aria-label="Icon (optional)"><input id="newCatName" class="mname" maxlength="40" placeholder="New category, e.g. Fitness" aria-label="New category name" required><button class="btn">Add category</button></form>
    <p class="uns" role="status">${esc(msg)}</p></section>
  <section aria-labelledby="arT"><h2 id="arT">Archived habits</h2>
    ${arch.length?`<p class="hint">Hidden from Home and category pages. All their history is kept.</p>`+arch.map(h=>{const c=S.cats.find(x=>x.id===h.cat);
      return `<div class="assignrow"><span><a class="name nm" href="${href.habit(h.id)}">${esc(h.name)}</a><span class="desc"> · ${esc(c?c.name:'No category')}</span></span><span class="mbtns"><button class="btn alt sv" data-restore="${h.id}">Restore</button><button class="rm" data-rm="${h.id}">Delete forever</button></span></div>`}).join(''):'<p class="empty">Nothing archived. Use “Archive” on a habit to hide it without losing it.</p>'}</section>`}
function renderMissing(what){
  $('page').innerHTML=`<section><nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a></nav><h2>${what} not found</h2><p class="empty">It may have been removed, or it has not finished loading from the cloud yet. <a href="${href.home}">Back to Home</a></p></section>`}

function renderMain(){
  S.habits.forEach(norm);
  const P=periods(),H=S.habits,R=parseHash(),need=unassigned(H,S.cats);
  $('date').textContent=P.t.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const show=(...ids)=>['assign','home','page','add','detail'].forEach(i=>{$(i).hidden=!ids.includes(i);if(i!=='add'&&!ids.includes(i))$(i).innerHTML=''});// hidden pages keep no stale HTML
  S.open=null;document.title='Habit tracker';
  if(need.length){renderAssign(need);show('assign');return}   // every habit needs a category before any page works
  const cs=$('cat'),cur=cs.value;cs.hidden=false;cs.innerHTML=S.cats.map(c=>`<option value="${c.id}">${esc((c.icon?c.icon+' ':'')+c.name)}</option>`).join('');if(S.cats.some(c=>c.id===cur))cs.value=cur;
  if(R.name==='habit'){const h=H.find(x=>x.id===R.id);
    if(h){S.open=h.id;document.title=h.name+' · Habit tracker';renderDetail(h);show('detail')}
    else{renderMissing('Habit');show('page')}}
  else if(R.name==='manage'){document.title='Manage categories · Habit tracker';renderManage();show('page')}
  else if(R.name==='cat'){const c=S.cats.find(x=>x.id===R.id);
    if(c){document.title=c.name+' · Habit tracker';renderCategory(c);cs.value=c.id;cs.hidden=true;show('page','add')}
    else{renderMissing('Category');show('page')}}
  else{renderHome();show('home')}
}
export function renderNotes(h){const ks=Object.keys(h.notes||{}).filter(k=>h.notes[k]).sort().reverse();
  $('notelist').innerHTML=ks.length?ks.map(k=>`<button class="nt" data-day="${k}"><b>${fmt(k)}</b><span>${esc(h.notes[k])}</span></button>`).join(''):'<p class="empty">No notes yet. Pick a day and write one.</p>'}
function renderDetail(h){const k=S.day||K(T());S.day=k;const cat=S.cats.find(c=>c.id===h.cat);
  $('detail').innerHTML=`<nav class="crumb" aria-label="Breadcrumb"><a href="${href.home}">Home</a><span aria-hidden="true">›</span>${cat?`<a href="${href.cat(cat.id)}">${esc(cat.name)}</a><span aria-hidden="true">›</span>`:''}<span aria-current="page">${esc(h.name)}</span></nav>
  <h2 class="dname">${esc(h.name)}</h2>
  <div class="dayrow"><input id="nameIn" value="${esc(h.name)}" maxlength="60" aria-label="Habit name"><button class="btn sv" data-rename="1">Rename</button></div>
  <div class="meta">${streakHTML(h)}<span>Done <b>${Object.keys(h.done).length}</b> days in total</span></div>
  <h2 style="margin-top:16px">Heatmap</h2>${heatmap({habits:S.habits,one:h,size:'large',id:'heatH'})}${legendHTML()}
  ${h.archived?`<div class="archbanner" role="status"><span>This habit is archived: hidden from Home and its category, history kept.</span><button class="btn sv" data-restore="${h.id}">Restore</button></div>`:''}
  <label for="moveCat" style="margin-top:14px">Category</label>
  <div class="dayrow"><select id="moveCat" aria-label="Move this habit to another category">${S.cats.map(c=>`<option value="${c.id}"${c.id===h.cat?' selected':''}>${esc((c.icon?c.icon+' ':'')+c.name)}</option>`).join('')}</select>${h.archived?'':`<button class="btn alt sv" data-archive="${h.id}">Archive habit</button>`}</div>
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

// The one render everybody calls: builds whichever page the address points to.
export function render(){
  hidePop();renderMain();
  document.querySelectorAll('.heat').forEach(rove)}
