// The Home page: foldable combined heatmap, category buttons, "Edit habits" link, and unified foldable Statistics at the bottom.
import {S} from './state.js';
import {$,K,T,esc,pct} from './util.js';
import {todayOf,todayStats,daily,periodic,periodicChecked} from './scoring.js';
import {live,inCat} from './categories.js';
import {heatmap,legendHTML,modeSwitch} from './heatmap.js';
import {statsSection} from './render.js';
import {href} from './router.js';

const isFolded=(key,def=false)=>S.fold&&key in S.fold?!!S.fold[key]:def;

function catButton(c){
  const hs=inCat(S.habits,c.id),{done,total}=todayOf(hs),p=pct(done,total),stats=todayStats(hs);
  const prog=total?`<span class="cb-num"><b>${done}</b> check${done===1?'':'s'}</span><span class="cb-lbl">today${stats.length?' · '+stats.join(' · '):''}</span>`
    :daily(hs).length?'<span class="cb-lbl cb-none">All paused today</span>'
    :hs.length?`<span class="cb-lbl cb-none">Periodic habits · ${periodicChecked(hs,K(T())).length} checked today</span>`:'<span class="cb-lbl cb-none">No habits yet</span>';
  return `<a class="catbtn" href="${href.cat(c.id)}" style="--c:${c.color}">
    <div class="cb-top"><span class="cb-name"><span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>${esc(c.name)}</span><span class="cb-go" aria-hidden="true">›</span></div>
    <div class="cb-prog">${prog}</div>
    <div class="cb-bar" aria-hidden="true"><i style="width:${p}%"></i></div>
    ${hs.length?heatmap({habits:hs,size:'small',interactive:false}):''}
  </a>`}

export function renderHome(){
  const H=live(S.habits);
  const hmFold=isFolded('home:hm',false);
  $('home').innerHTML=`<section aria-labelledby="homeHeatT">
    <div class="sec-hd"><h2 id="homeHeatT"><button type="button" class="ftog" data-fold="home:hm" aria-expanded="${!hmFold}"><span class="farr" aria-hidden="true">${hmFold?'▸':'▾'}</span> All habits · 20 weeks</button></h2>
      ${H.length?`<a class="btn alt sv" href="${href.day(K(T()))}">Edit today</a>`:''}</div>
    ${hmFold?'':`${modeSwitch(H,'heat')}${heatmap({habits:H,size:'large',id:'heat'})}${legendHTML(periodic(H).length>0)}`}
    ${H.length?'':'<p class="empty" style="margin-top:12px">No habits yet. Open “Edit habits” below to add your first one.</p>'}</section>
  <div class="sech-row"><h2 class="sech" id="catsT">Categories</h2><span class="hlinks"><a class="mlink" href="${href.code}">Code DB</a> · <a class="mlink" href="${href.manage}">Edit habits</a></span></div>
  <nav class="cats" aria-labelledby="catsT">${S.cats.map(catButton).join('')}</nav>
  ${H.length?statsSection('a','all',H):''}`}
