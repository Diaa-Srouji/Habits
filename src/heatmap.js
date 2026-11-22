// The reusable heatmap component (3 sizes), its scoped day popover, and keyboard access.
import {S} from './state.js';
import {K,add,dateOf,mondayOf,esc} from './util.js';
import {isOff,isFrozen,isLogged,pctOf,dayPercent,paint,pctText,amtFull,txtAmt,periods,sumOf,dayNotes,textDays,
  isPeriodic,isChecked,daily,periodic,periodicChecked,periodsDay,countLabel} from './scoring.js';
import {descendantGroupIds} from './categories.js';
import {href} from './router.js';

const W=20,STRIP=28;

const MODES=['all','daily','periods'];
export function getMode(){if(!S.hmode){let m='all';try{const v=localStorage.getItem('hmode');if(MODES.includes(v))m=v}catch(e){}S.hmode=m}return S.hmode}
export function setMode(m){if(!MODES.includes(m))return;S.hmode=m;try{localStorage.setItem('hmode',m)}catch(e){}}
export const modeFor=habits=>periodic(habits).length?getMode():'all';
export function modeSwitch(habits,forId){if(!periodic(habits).length)return '';const m=getMode();
  const b=(v,t,tip)=>`<button type="button" class="btn alt sv hmb" data-hmode="${v}" data-hmfor="${forId}" aria-pressed="${m===v}" title="${tip}">${t}</button>`;
  return `<div class="hmode" role="group" aria-label="Which habits the heatmap shows">${b('all','All','Daily habits colour the days; a marker shows periodic habits')}${b('daily','Daily only','Hide periodic habits')}${b('periods','Periods only','Only periodic habits, merged')}</div>`}

function cell(d,first,one,H,P,o){
  const k=K(d);
  if(d<first)return '<div class="pre"></div>';
  const ids=o.st?'':` data-pk="${k}" data-ph="${one?one.id:''}"`;
  if(d>P.t)return `<div class="fut"${ids}></div>`;
  const ds=d.toLocaleDateString(undefined,{day:'numeric',month:'short'}),isT=k===K(P.t),lg=h=>isPeriodic(h)?isChecked(h,k):isLogged(h,k),
    now=isT?' now':'',hn=o.td&&o.td.has(k)?' hn':'',sel=o.ed&&S.open&&k===S.day?' sel':'',ed=o.ed?' edit':'';
  const mk=(cls,label,style='',inner='')=>o.st?`<div class="cell ${cls}"${style}>${inner}</div>`
    :`<button class="${cls}"${style}${ids} ${o.ed?`data-day="${k}"`:'tabindex="-1"'} aria-label="${label}">${inner}</button>`;
  if(!one&&o.mode==='periods'){const r=periodsDay(o.all,k);
    if(!r)return mk('pend'+now,ds+': no periodic habit checked');
    const g=paint(r.p);
    return mk(g.cls+' pc'+now,ds+': '+r.n+' periodic habit'+(r.n===1?'':'s')+' checked · '+pctText(r.p),g.style?` style="${g.style}"`:'',o.num?`<span class="pcn">${countLabel(r.n)}</span>`:'')}
  const pk=!one&&o.mode==='all'?periodicChecked(o.all,k).length:0,mark=pk?'<i class="pmk"></i>':'',pc=pk?' pc':'',more=pk?' · '+pk+' periodic checked':'';
  if(!one){const all=H.filter(h=>h.created<=k);if(all.length&&all.every(h=>isOff(h,k)))return all.every(h=>isFrozen(h,k))?mk('frz'+pc+now,ds+': all habits frozen'+more,'',mark):mk('skip'+pc+now,ds+': all habits skipped'+more,'',mark)}
  if(one&&isFrozen(one,k))return mk('frz'+ed+now+sel+hn,ds+': frozen');
  if(one&&isOff(one,k))return mk('skip'+ed+now+sel+hn,`${ds}: skipped (${esc(one.off[k]||'no reason')})`);
  let p=null,label;
  if(one){const v=one.done[k]||0;
    if(lg(one)){p=pctOf(one,v,k);label=ds+': '+txtAmt(one,v)+(one.type==='bool'?'':' · '+amtFull(one,v,k))}
    else label=ds+': '+(isT?'not logged yet':'not logged')}
  else{p=dayPercent(H,k,isT);const act=H.filter(h=>h.created<=k&&!isOff(h,k));
    label=ds+': '+act.filter(lg).length+' of '+act.length+' habits logged'+(p===null?'':' · '+pctText(p))+more}
  if(p===null)return mk((pk?'pon':'pend')+pc+ed+now+sel+hn,label,'',mark);
  const g=paint(p,!!one);
  return mk(g.cls+pc+ed+now+sel+hn,label,g.style?` style="${g.style}"`:'',mark)}

// scope: '' (all habits), 'c:<catId>' (one category), or 'g:<grpId>' (one group + nested sub-groups)
export function heatmap({habits,one=null,size='large',interactive=true,id='',full=false,scope=''}){
  const P=periods(),sm=size==='small',st=!interactive,mode=one?'all':modeFor(habits),
    o={st,ed:!!one&&!st&&!sm,td:one?textDays(one):null,mode,all:habits,num:!sm};
  const first=dateOf(one?one.created:(habits.map(h=>h.created).sort()[0]||K(P.t)));
  let start,n;
  if(sm){n=STRIP;start=add(P.t,-(STRIP-1))}
  else{n=W*7;const cur=mondayOf(P.t),wk0=mondayOf(first);start=full||Math.round((cur-wk0)/6048e5)>=W?add(cur,-(W-1)*7):wk0}
  const H=one?habits:daily(habits);
  let cells='';for(let i=0;i<n;i++)cells+=cell(add(start,i),first,one,H,P,o);
  const grid=`<div class="heat heat-${size==='small'?'sm':size==='medium'?'md':'lg'}"${id?` id="${id}"`:''}${scope?` data-scope="${esc(scope)}"`:''}${st?' aria-hidden="true"':' role="group" aria-label="Heatmap"'}>${cells}</div>`;
  return sm?grid:`<div class="scroll">${grid}</div>`}

export const legendHTML=(periodicToo=false)=>'<div class="legend"><i class="lgr"></i> 0% · <i class="gbar"></i> &gt;0% → 100% → 200% (darker = more) · <i class="lgm"></i> Not logged · <i class="sksw"></i> Skipped · <i class="icsw"></i> Frozen'+(periodicToo?' · <i class="pmsw"><i class="pmk"></i></i> Periodic checked · <i class="posw"></i> Only periodic':'')+'</div>';

export function rove(box){if(!box)return;const cells=[...box.querySelectorAll('[data-pk]')];if(!cells.length)return;
  const tgt=box.querySelector('.now')||[...cells].reverse().find(c=>!c.classList.contains('fut'))||cells[0];
  cells.forEach(c=>c.tabIndex=c===tgt?0:-1)}

const pop={el:null,cell:null,pinned:false,key:''};
function popHTML(k,hid,scope=''){
  const P=periods(),d=dateOf(k),today=k===K(P.t),one=hid&&S.habits.find(x=>x.id===hid);
  let H=S.habits.filter(h=>!h.archived);
  if(scope.startsWith('c:'))H=H.filter(h=>h.cat===scope.slice(2));
  else if(scope.startsWith('g:')){const ids=descendantGroupIds(S.grps,scope.slice(2));H=H.filter(h=>ids.has(h.grp))}
  let out=`<div class="ph">${d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',year:'numeric'})}</div>`;
  if(d>P.t)return out+'<div class="pl">Upcoming</div>';
  const extra=h=>{const s=sumOf(h,k);
    return (s?`<div class="ps">${esc(s)}</div>`:'')+dayNotes(h,k).filter(n=>n.t.trim()).map(n=>`<div class="pn">${esc(n.t)}</div>`).join('')};
  const line=h=>{if(isFrozen(h,k)){return `<div class="pl"><i class="pd" style="background:var(--ice)"></i>${one?'':esc(h.name)+': '}<b>❄ Frozen</b>${extra(h)}</div>`}
    if(isOff(h,k)){return `<div class="pl"><i class="pd" style="background:var(--skip)"></i>${one?'':esc(h.name)+': '}<b>Skipped</b> · ${esc(h.off[k]||'no reason')}${extra(h)}</div>`}
    const v=h.done[k]||0,lg=isPeriodic(h)?isChecked(h,k):isLogged(h,k),sw=lg?paint(pctOf(h,v,k)):null;
    const txt=lg?`<b>${txtAmt(h,v)}</b>${h.type==='bool'?'':' · '+amtFull(h,v,k)}`:(today?'Not logged yet':'Not logged'+(!one&&!h.stop?' · counts as 0%':''));
    return `<div class="pl"><i class="pd${sw?' '+sw.cls:''}"${sw&&sw.style?` style="${sw.style}"`:''}></i>${one?'':esc(h.name)+': '}${txt}${extra(h)}</div>`};
  const Hd=daily(H),mode=periodic(H).length?getMode():'all';
  const pline=h=>{const v=h.done[k],g=mode==='periods'?paint(pctOf(h,v,k)):null,
    amt=h.type==='bool'?'':h.type==='text'?' · '+amtFull(h,v,k):' · '+txtAmt(h,v)+' · '+amtFull(h,v,k);
    return `<div class="pl"><i class="pd${g?' '+g.cls:''}"${g&&g.style?` style="${g.style}"`:''}></i>${esc(h.name)}: <b>Done · periodic</b>${amt}${extra(h)}</div>`};
  if(one)out+=line(one);
  else{
    if(mode!=='periods')out+=Hd.filter(h=>h.created<=k).map(line).join('');
    const pc=mode==='daily'?[]:periodicChecked(H,k);
    if(mode==='periods'&&!pc.length)out+='<div class="pl">No periodic habit checked</div>';
    out+=pc.map(pline).join('');
    if(mode==='periods'){const r=periodsDay(H,k);if(r)out+=`<div class="pl pt">Periods total: <b>${pctText(r.p)}</b> · ${r.n} habit${r.n===1?'':'s'}</div>`}
    else if(Hd.length){const tp=dayPercent(Hd,k,today);out+=`<div class="pl pt">Day total: <b>${tp===null?'no data':pctText(tp)}</b></div>`}}
  out+=`<div class="pact"><a class="btn alt sv" href="${href.day(k)}">Open full day</a>`+(one&&!S.open?`<button class="btn sv" data-editday="${one.id}|${k}">Edit this day</button>`:'')+'</div>';
  return out}
function showPop(c,pin){
  if(!pop.el){pop.el=document.createElement('div');pop.el.id='pop';pop.el.setAttribute('role','tooltip');document.body.appendChild(pop.el)}
  const sc=c.closest('.heat')?.dataset.scope||'';
  const p=pop.el;p.innerHTML=popHTML(c.dataset.pk,c.dataset.ph,sc);p.hidden=false;
  const r=c.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight;
  p.style.left=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8))+'px';
  p.style.top=(r.top-h-8<8?r.bottom+8:r.top-h-8)+'px';
  pop.cell=c;pop.pinned=!!pin;pop.key=c.dataset.pk+'|'+c.dataset.ph+'|'+sc}
export function hidePop(){if(pop.el)pop.el.hidden=true;pop.cell=null;pop.pinned=false;pop.key=''}

export function initHeatmapEvents(){
  document.addEventListener('mouseover',e=>{const c=e.target.closest&&e.target.closest('.heat [data-pk]');if(c&&!pop.pinned)showPop(c,false)});
  document.addEventListener('mouseout',e=>{if(!pop.pinned&&e.target.closest&&e.target.closest('.heat [data-pk]'))hidePop()});
  document.addEventListener('click',e=>{const c=e.target.closest&&e.target.closest('.heat [data-pk]');
    if(!c){if(!e.target.closest('#pop'))hidePop();return}
    const sc=c.closest('.heat')?.dataset.scope||'';
    if(pop.pinned&&pop.key===c.dataset.pk+'|'+c.dataset.ph+'|'+sc){hidePop();return}
    const live=[...document.querySelectorAll('.heat [data-pk]')].find(x=>x.dataset.pk===c.dataset.pk&&x.dataset.ph===c.dataset.ph&&(x.closest('.heat')?.dataset.scope||'')===sc&&x.offsetParent!==null)||c;
    showPop(live,true)});
  let kbd=0;
  window.addEventListener('scroll',()=>{if(Date.now()-kbd>400)hidePop()},{passive:true});window.addEventListener('resize',hidePop);
  const cellOf=e=>e.target.closest&&e.target.closest('.heat [data-pk]');
  document.addEventListener('focusin',e=>{const c=cellOf(e);if(c&&!pop.pinned&&c.matches(':focus-visible'))showPop(c,false)});
  document.addEventListener('focusout',e=>{if(!pop.pinned&&cellOf(e))hidePop()});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){hidePop();return}
    const c=cellOf(e),row=c&&c.parentElement.classList.contains('heat-sm'),
      d=c&&(row?{ArrowLeft:-1,ArrowRight:1}:{ArrowUp:-1,ArrowDown:1,ArrowLeft:-7,ArrowRight:7})[e.key];if(!d)return;
    const kids=[...c.parentElement.children];let i=kids.indexOf(c)+d;
    while(kids[i]&&!kids[i].dataset.pk)i+=d;
    const n=kids[i];if(!n)return;
    e.preventDefault();kbd=Date.now();c.tabIndex=-1;n.tabIndex=0;hidePop();n.focus()});
}
