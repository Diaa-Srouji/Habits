// The Home page: one big heatmap of every habit, then one big button per category.
import {S} from './state.js';
import {$,esc,pct} from './util.js';
import {todayOf} from './scoring.js';
import {live,inCat} from './categories.js';
import {heatmap,legendHTML} from './heatmap.js';
import {href} from './router.js';

// One category button: name, today's progress ("3 of 5"), a thin heat strip of the last 4 weeks, in the category colour.
// It is a real link (so middle-click, long-press and Back all work) and holds no buttons inside.
function catButton(c){
  const hs=inCat(S.habits,c.id),{done,total}=todayOf(hs),p=pct(done,total);
  const prog=total?`<span class="cb-num"><b>${done}</b> of ${total}</span><span class="cb-lbl">habits done today</span>`
    :'<span class="cb-lbl cb-none">No habits yet</span>';
  return `<a class="catbtn" href="${href.cat(c.id)}" style="--c:${c.color}">
    <div class="cb-top"><span class="cb-name"><span class="cb-icon" aria-hidden="true">${esc(c.icon||'●')}</span>${esc(c.name)}</span><span class="cb-go" aria-hidden="true">›</span></div>
    <div class="cb-prog">${prog}</div>
    <div class="cb-bar" aria-hidden="true"><i style="width:${p}%"></i></div>
    ${hs.length?heatmap({habits:hs,size:'small',interactive:false}):''}
  </a>`}

export function renderHome(){
  const H=live(S.habits);
  $('home').innerHTML=`<section aria-labelledby="homeHeatT"><h2 id="homeHeatT">All habits · 20 weeks</h2>
    ${heatmap({habits:H,size:'large',id:'heat'})}${legendHTML()}
    ${H.length?'':'<p class="empty" style="margin-top:12px">No habits yet. Open a category below to add your first one.</p>'}</section>
  <div class="sech-row"><h2 class="sech" id="catsT">Categories</h2><a class="mlink" href="${href.manage}">Manage categories</a></div>
  <nav class="cats" aria-labelledby="catsT">${S.cats.map(catButton).join('')}</nav>`}
