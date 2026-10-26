// The reusable heatmap component (3 sizes), its day popover, and keyboard access.
import {S} from './state.js';
import {K,add,dateOf,mondayOf,esc} from './util.js';
import {isOff,levelOf,dayScore,txtAmt,LN,scoreColor,periods} from './scoring.js';

const W=20,STRIP=28;

// One day square.  o.ed = clickable "edit this day" cell (one habit only).  o.st = plain decoration with no buttons,
// so a heatmap can sit inside a link without nesting buttons in it.
function cell(d,first,one,H,P,o){
  const k=K(d);
  if(d<first)return '<div class="pre"></div>';
  const ids=o.st?'':` data-pk="${k}" data-ph="${one?one.id:''}"`;
  if(d>P.t)return `<div class="fut"${ids}></div>`;
  const ds=d.toLocaleDateString(undefined,{day:'numeric',month:'short'}),isT=k===K(P.t),lg=h=>h.done[k]>0||!!(h.skip||{})[k],
    now=isT?' now':'',hn=one&&one.notes&&one.notes[k]?' hn':'',sel=o.ed&&S.open&&k===S.day?' sel':'',ed=o.ed?' edit':'';
  const mk=(cls,label,style='')=>o.st?`<div class="cell ${cls}"${style}></div>`
    :`<button class="${cls}"${style}${ids} ${o.ed?`data-day="${k}"`:'tabindex="-1"'} aria-label="${label}"></button>`;
  if(!one){const all=H.filter(h=>h.created<=k);if(all.length&&all.every(h=>isOff(h,k)))return mk('skip'+now,ds+': all habits skipped')}
  if(one&&isOff(one,k))return mk('skip'+ed+now+sel+hn,`${ds}: skipped (${esc(one.off[k]||'no reason')})`);
  let lv,sc=0,label,logged;
  if(one){const v=one.done[k]||0;logged=lg(one);lv=levelOf(one,v);sc=dayScore(one,v);
    label=ds+': '+(logged?txtAmt(one,v)+' ('+LN[lv]+')':isT?'not logged yet':'not logged, counted as '+txtAmt(one,0))}
  else{const act=H.filter(h=>h.created<=k&&!isOff(h,k)),sum=act.reduce((a,h)=>a+levelOf(h,h.done[k]||0),0),avg=act.length?sum/act.length:0;
    logged=act.some(lg);lv=sum?Math.max(1,Math.min(5,Math.round(avg))):0;sc=act.length?act.reduce((a,h)=>a+dayScore(h,h.done[k]||0),0)/act.length:0;
    label=ds+': '+act.filter(lg).length+' of '+act.length+' habits logged'}
  const pend=isT&&!logged,miss=!isT&&!logged;
  return mk((pend?'pend':miss?'miss'+(lv>=3?' good':''):'l'+lv)+ed+now+sel+hn,label,pend||miss?'':` style="background-color:${scoreColor(sc)}"`)}

// THE heatmap.  Returns an HTML string.
//   habits      the habits to combine (all habits, one category, ...)
//   one         a single habit to show on its own (its days become clickable); omit for a combined map
//   size        'large'  20 weeks, big squares (Home, habit page)
//               'medium' 20 weeks, compact squares (category page)
//               'small'  one thin row of the last 28 days (category buttons, habit blocks)
//   interactive false = plain coloured squares with no buttons or popover (safe inside a link)
//   id          optional element id
export function heatmap({habits,one=null,size='large',interactive=true,id=''}){
  const P=periods(),sm=size==='small',st=!interactive,o={st,ed:!!one&&!st&&!sm};
  const first=dateOf(one?one.created:(habits.map(h=>h.created).sort()[0]||K(P.t)));
  let start,n;
  if(sm){n=STRIP;start=add(P.t,-(STRIP-1))}
  else{// starts in the week of the first day (earlier days stay blank) and slides forward once older than W weeks
    n=W*7;const cur=mondayOf(P.t),wk0=mondayOf(first);start=Math.round((cur-wk0)/6048e5)>=W?add(cur,-(W-1)*7):wk0}
  let cells='';for(let i=0;i<n;i++)cells+=cell(add(start,i),first,one,habits,P,o);
  const grid=`<div class="heat heat-${size==='small'?'sm':size==='medium'?'md':'lg'}"${id?` id="${id}"`:''}${st?' aria-hidden="true"':' role="group" aria-label="Heatmap"'}>${cells}</div>`;
  return sm?grid:`<div class="scroll">${grid}</div>`}

export const legendHTML=()=>'<div class="legend">None <i class="gbar"></i> Best · <i class="lgm"></i> Not logged (counts as 0) · <i class="sksw"></i> Skipped · Hover or click a day for details</div>';

// Heatmap keyboard access: one tab stop per grid (today's cell), arrow keys move between days
export function rove(box){if(!box)return;const cells=[...box.querySelectorAll('[data-pk]')];if(!cells.length)return;
  const tgt=box.querySelector('.now')||[...cells].reverse().find(c=>!c.classList.contains('fut'))||cells[0];
  cells.forEach(c=>c.tabIndex=c===tgt?0:-1)}

const pop={el:null,cell:null,pinned:false,key:''};
function popHTML(k,hid){
  const P=periods(),H=S.habits.filter(h=>!h.archived),d=dateOf(k),today=k===K(P.t),one=hid&&S.habits.find(x=>x.id===hid);
  let out=`<div class="ph">${d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</div>`;
  if(d>P.t)return out+'<div class="pl">Upcoming</div>';
  const line=h=>{if(isOff(h,k)){const n0=(h.notes||{})[k];return `<div class="pl"><i class="pd" style="background:var(--skip)"></i>${one?'':esc(h.name)+': '}<b>Skipped</b> · ${esc(h.off[k]||'no reason')}${n0?`<div class="pn">${esc(n0)}</div>`:''}</div>`}
    const v=h.done[k]||0,lg=v>0||!!(h.skip||{})[k],lv=levelOf(h,v),n=(h.notes||{})[k];
    const nm=lg&&v===0&&!h.stop&&h.type!=='bool'?'Skipped':LN[lv];
    const txt=lg?`<b>${txtAmt(h,v)}</b> · ${nm}`:(today?'Not logged yet':'Not logged · counted as '+txtAmt(h,0));
    return `<div class="pl"><i class="pd${!lg&&!today?' miss'+(lv>=3?' good':''):''}" style="${lg?'background:'+scoreColor(dayScore(h,v)):today?'background:var(--pend)':''}"></i>${one?'':esc(h.name)+': '}${txt}${n?`<div class="pn">${esc(n)}</div>`:''}</div>`};
  out+=one?line(one):H.filter(h=>h.created<=k).map(line).join('');
  if(one&&!S.open)out+=`<button class="btn sv" style="margin-top:10px" data-editday="${one.id}|${k}">Edit this day</button>`;
  return out}
function showPop(c,pin){
  if(!pop.el){pop.el=document.createElement('div');pop.el.id='pop';pop.el.setAttribute('role','tooltip');document.body.appendChild(pop.el)}
  const p=pop.el;p.innerHTML=popHTML(c.dataset.pk,c.dataset.ph);p.hidden=false;
  const r=c.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight;
  p.style.left=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8))+'px';
  p.style.top=(r.top-h-8<8?r.bottom+8:r.top-h-8)+'px';
  pop.cell=c;pop.pinned=!!pin;pop.key=c.dataset.pk+'|'+c.dataset.ph}
export function hidePop(){if(pop.el)pop.el.hidden=true;pop.cell=null;pop.pinned=false;pop.key=''}

export function initHeatmapEvents(){
  document.addEventListener('mouseover',e=>{const c=e.target.closest&&e.target.closest('.heat [data-pk]');if(c&&!pop.pinned)showPop(c,false)});
  document.addEventListener('mouseout',e=>{if(!pop.pinned&&e.target.closest&&e.target.closest('.heat [data-pk]'))hidePop()});
  document.addEventListener('click',e=>{const c=e.target.closest&&e.target.closest('.heat [data-pk]');
    if(!c){if(!e.target.closest('#pop'))hidePop();return}
    if(pop.pinned&&pop.key===c.dataset.pk+'|'+c.dataset.ph){hidePop();return}
    const live=[...document.querySelectorAll('.heat [data-pk]')].find(x=>x.dataset.pk===c.dataset.pk&&x.dataset.ph===c.dataset.ph&&x.offsetParent!==null)||c;
    showPop(live,true)});
  let kbd=0;
  window.addEventListener('scroll',()=>{if(Date.now()-kbd>400)hidePop()},{passive:true});window.addEventListener('resize',hidePop);
  const cellOf=e=>e.target.closest&&e.target.closest('.heat [data-pk]');
  document.addEventListener('focusin',e=>{const c=cellOf(e);if(c&&!pop.pinned&&c.matches(':focus-visible'))showPop(c,false)});
  document.addEventListener('focusout',e=>{if(!pop.pinned&&cellOf(e))hidePop()});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){hidePop();return}
    const c=cellOf(e),row=c&&c.parentElement.classList.contains('heat-sm'),// the thin strip is one row: left/right = previous/next day
      d=c&&(row?{ArrowLeft:-1,ArrowRight:1}:{ArrowUp:-1,ArrowDown:1,ArrowLeft:-7,ArrowRight:7})[e.key];if(!d)return;
    const kids=[...c.parentElement.children];let i=kids.indexOf(c)+d;
    while(kids[i]&&!kids[i].dataset.pk)i+=d;
    const n=kids[i];if(!n)return;
    e.preventDefault();kbd=Date.now();c.tabIndex=-1;n.tabIndex=0;hidePop();n.focus()});
}
