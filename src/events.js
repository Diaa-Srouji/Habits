// All user-input wiring: forms, buttons, theme, sign-in, backup.
import {S} from './state.js';
import {$,K,T} from './util.js';
import {cleanFreq,freqText,freeze,unfreeze,unfreezeDay,setGoal,TYPES,unitType,SHORT,shortAmt,pctOf,paint,logPct,setAmt,cleanHabit,addNote,setNote,delNote,moveNote,resetNoteOrder,pruneEmpty} from './scoring.js';
import {render,refreshRange,resetRange} from './render.js';
import {unassigned,cleanCats,mergeCats,moveCat,renumber,newCatId,cleanGrps,mergeGrps,renumberGrps,moveGrp,newGrpId,groupsOf} from './categories.js';
import {hidePop,setMode} from './heatmap.js';
import {navigate,href} from './router.js';
import {save,setSync,syncNow,signIn,signUp,logOut,sendReset} from './sync.js';
import {initDrag} from './drag.js';

// The add form has two choices: the kind (Number, True / false, Text) and the direction (the Stop checkbox).
// A Number habit has a unit the person types; "min" and "hours" are recognised by name (see unitType) and keep the "1 h 35 min" style.
// How often: a label only. A whole number from 1 (up to 99 per week / month, 365 days apart); anything else is brought back into that range.
const fqFrom=(n,per)=>cleanFreq({n:Math.min(Math.max(Math.round(Number(n))||1,1),per==='days'?365:99),per});
function newHabit(name){const kind=$('type').value,stop=$('stop').checked;
  const fq=!stop&&$('newFqMode').value==='p'?fqFrom($('newFqN').value,$('newFqPer').value):undefined;   // periodic habits: one optional field
  let type='num',unit='',goal=1;
  if(kind==='bool'){type='bool'}
  else if(kind==='text'){type='text';unit='%';goal=100}
  else{const u=unitType($('unit').value),g=Number($('goal').value);type=u.type;unit=u.unit;goal=g>0?g:(stop?TYPES[type].stop:TYPES[type].goal)}
  const cv=$('cat').value,cat=S.cats.some(c=>c.id===cv)?cv:S.cats[0].id;
  const gv=$('grp').value,grp=!$('grp').hidden&&S.grps.some(g=>g.id===gv&&g.cat===cat)?gv:null;   // the group (wird) chosen in the add form
  return {id:'h'+Date.now().toString(36),name,cat,...(grp?{grp}:{}),...(fq?{fq}:{}),type,stop,goal,unit,importance:Number($('impt').value)||3,created:K(T()),done:{},skip:{},notes:{},gl:type==='bool'||type==='text'?{}:{[K(T())]:goal}}}
// The "How often" part of the add form. Stop habits are daily only.
function syncFq(){const stop=$('stop').checked,m=$('newFqMode'),per=$('newFqPer').value;
  if(stop)m.value='';m.disabled=stop;
  const on=m.value==='p'&&!stop;$('newFqBox').hidden=!on;
  const f=on?fqFrom($('newFqN').value,per):null;
  $('newFqPrev').textContent=stop?'Stop habits are daily only.':on&&f?'Shown as “'+freqText({fq:f})+'”. Only a label.':''}
function syncForm(){const kind=$('type').value,stop=$('stop').checked,num=kind==='num';
  $('stopLbl').textContent=kind==='text'?'Stop habit (write only when you slip)':kind==='bool'?'Stop habit (avoid it)':'Stop habit (less is better, with a daily limit)';
  $('unit').hidden=!num;$('goalWrap').hidden=!num;
  $('goalLbl').textContent=stop?'Daily limit':'Daily goal';
  $('goal').value=stop?TYPES.num.stop:TYPES.num.goal;$('goalUnit').textContent=$('unit').value.trim();syncFq()}
function markUnsaved(row){S.saved=false;const ss=$('savestate');if(ss)ss.textContent='Unsaved changes';const u=row&&row.querySelector('.uns');if(u)u.textContent='Unsaved'}
function saveDay(h,k){const dk=h.id+'|'+k;if(S.draft&&dk in S.draft){setAmt(h,k,S.draft[dk]);delete S.draft[dk]}
  const dr=S.noteDraft&&S.noteDraft.k===k?S.noteDraft:null;   // text typed but not saved yet: the summary and each note
  if(dr){if(dr.sum!==undefined){const v=dr.sum.trim();h.sum=h.sum||{};if(v)h.sum[k]=v;else delete h.sum[k]}
    for(const id in dr.v||{})setNote(h,k,id,dr.v[id])}
  pruneEmpty(h,null);   // a note whose text was cleared (or never written) is removed
  S.noteDraft=null;S.saved=true}
// the not-yet-saved text of the day on screen
const draft=()=>{if(!S.noteDraft||S.noteDraft.k!==S.day)S.noteDraft={k:S.day,v:{}};if(!S.noteDraft.v)S.noteDraft.v={};return S.noteDraft};
const openHabit=()=>S.habits.find(x=>x.id===S.open);
const focusSel=q=>{const el=document.querySelector(q);if(el)el.focus();return !!el};

const msg=t=>{$('msg').textContent=t};
const authErr=e=>msg(({'auth/invalid-credential':'Wrong email or password.','auth/email-already-in-use':'That email already has an account. Sign in instead.','auth/weak-password':'Use a password with at least 6 characters.','auth/invalid-email':'Enter a valid email address.','auth/operation-not-allowed':'Email sign-in is not enabled in Firebase yet.','auth/missing-email':'Enter your email first.','auth/too-many-requests':'Too many attempts. Try again in a few minutes.','auth/network-request-failed':'No connection. Check your internet and try again.'})[e.code]||'Could not sign in ('+e.code+').');

export function initEvents(){
  document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
    if(t.dataset.assignsave){const d=S.assignDraft||{},need=unassigned(S.habits,S.cats),miss=need.filter(h=>!S.cats.some(c=>c.id===d[h.id]));
      if(miss.length){$('assignmsg').textContent='Choose a category for every habit ('+miss.length+' left).';return}
      need.forEach(h=>{h.cat=d[h.id]});S.assignDraft=null}
    else if(t.dataset.lvl){const [id,k,i]=t.dataset.lvl.split('|');const h=S.habits.find(x=>x.id===id);if(h){(S.draft=S.draft||{})[id+'|'+k]=shortAmt(h,SHORT[+i],k);S.saved=false}}
    else if(t.dataset.skipopen){S.skipFor=t.dataset.skipopen}
    else if(t.dataset.skipcancel){S.skipFor=null}
    else if(t.dataset.skipgo){const [id,k]=t.dataset.skipgo.split('|'),h=S.habits.find(x=>x.id===id);
      if(h){const pn=t.closest('.skippanel');let r=pn.querySelector('select').value;if(r==='Other…')r=pn.querySelector('input').value.trim()||'Other';
        h.off=h.off||{};h.off[k]=r;delete h.done[k];delete h.skip[k];if(k<h.created)h.created=k;if(S.draft)delete S.draft[t.dataset.skipgo]}S.skipFor=null}
    else if(t.dataset.unskip){const [id,k]=t.dataset.unskip.split('|'),h=S.habits.find(x=>x.id===id);if(h&&h.off)delete h.off[k]}
    else if(t.dataset.bool){const [id,k,val]=t.dataset.bool.split('|');(S.draft=S.draft||{})[id+'|'+k]=+val;S.saved=false}
    else if(t.dataset.save){const [id,k]=t.dataset.save.split('|');const h=S.habits.find(x=>x.id===id);if(h){if(S.draft&&t.dataset.save in S.draft){setAmt(h,k,S.draft[t.dataset.save]);delete S.draft[t.dataset.save]}
      const tk=t.dataset.save+'#t';if(S.draft&&tk in S.draft){const v=String(S.draft[tk]).trim();h.sum=h.sum||{};if(v)h.sum[k]=v;else delete h.sum[k];delete S.draft[tk]}}}   // a text habit also saves its text (the day's summary)
    else if(t.dataset.saveday){const h=S.habits.find(x=>x.id===S.open);if(h)saveDay(h,S.day)}
    else if(t.dataset.rename){const h=S.habits.find(x=>x.id===S.open),v=$('nameIn').value.trim();if(h&&v)h.name=v}
    else if(t.dataset.day){if(S.open){S.day=t.dataset.day;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false}else{return}}
    else if(t.dataset.editday){const [id,k]=t.dataset.editday.split('|');// open that habit's page on that day
      S.day=k;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;hidePop();
      S.keepDay=navigate(href.habit(id));if(S.keepDay)return;window.scrollTo(0,0)}
    else if(t.dataset.ntadd){const h=openHabit();if(!h)return;const id=addNote(h,S.day);save();render();focusSel(`[data-nt="${id}"]`);return}
    else if(t.dataset.ntdel){const h=openHabit();if(!h||!confirm('Delete this note? This cannot be undone.'))return;
      delNote(h,S.day,t.dataset.ntdel);if(S.noteDraft&&S.noteDraft.v)delete S.noteDraft.v[t.dataset.ntdel];save();render();focusSel('[data-ntadd]');return}
    else if(t.dataset.ntup||t.dataset.ntdown){const h=openHabit(),id=t.dataset.ntup||t.dataset.ntdown,up=!!t.dataset.ntup;if(!h)return;
      moveNote(h,S.day,id,up?-1:1);save();render();   // keep the keyboard on the same note: if its button is now disabled, use the other one
      focusSel(`[data-nt${up?'up':'down'}="${id}"]:not([disabled])`)||focusSel(`[data-nt${up?'down':'up'}="${id}"]`);return}
    else if(t.dataset.ntreset){const h=openHabit();if(!h)return;resetNoteOrder(h,S.day);save();render();focusSel('[data-ntadd]');return}
    else if(t.dataset.freeze){const h=S.habits.find(x=>x.id===t.dataset.freeze);if(!h||!freeze(h))return;if(S.draft)delete S.draft[h.id+'|'+K(T())];S.skipFor=null}
    else if(t.dataset.unfreezeday){const [id,k]=t.dataset.unfreezeday.split('|'),h=S.habits.find(x=>x.id===id);if(!h||!unfreezeDay(h,k))return}
    else if(t.dataset.unfreeze){const h=S.habits.find(x=>x.id===t.dataset.unfreeze);if(!h||!unfreeze(h))return}
    else if(t.dataset.archive){const h=S.habits.find(x=>x.id===t.dataset.archive);if(!h)return;
      h.archived=true;S.draft={};S.skipFor=null;if(S.open===h.id){save();navigate(href.cat(h.cat));return}}
    else if(t.dataset.restore){const h=S.habits.find(x=>x.id===t.dataset.restore);if(!h)return;delete h.archived}
    else if(t.dataset.catup||t.dataset.catdown){const id=t.dataset.catup||t.dataset.catdown;
      S.cats=moveCat(S.cats,id,t.dataset.catup?-1:1);save();render();
      const b=document.querySelector(`[data-cat${t.dataset.catup?'up':'down'}="${id}"]:not([disabled])`)||document.querySelector(`[data-cat${t.dataset.catup?'down':'up'}="${id}"]`);if(b)b.focus();return}
    else if(t.dataset.catdel){S.delCat=t.dataset.catdel}
    else if(t.dataset.catdelcancel){S.delCat=null}
    else if(t.dataset.catdelgo){const id=t.dataset.catdelgo,sel=$('delTarget'),to=sel?sel.value:null,mine=S.habits.filter(h=>h.cat===id);
      if(S.cats.length<2||(mine.length&&!S.cats.some(c=>c.id===to&&c.id!==id)))return;   // never delete the last category, never orphan habits
      mine.forEach(h=>{h.cat=to;delete h.grp});S.grps=renumberGrps(S.grps.filter(g=>g.cat!==id));S.cats=renumber(S.cats.filter(c=>c.id!==id));S.delCat=null}   // its groups go too; the habits stay, outside any group
    else if(t.dataset.rm){const h=S.habits.find(x=>x.id===t.dataset.rm);if(!h||!confirm('Delete "'+h.name+'" and all its history forever? This cannot be undone. (Archive keeps it instead.)'))return;
      S.habits=S.habits.filter(x=>x.id!==t.dataset.rm)}
    else if(t.dataset.grptoggle){const id=t.dataset.grptoggle;(S.shut=S.shut||{})[id]=!S.shut[id];save();render();focusSel(`[data-grptoggle="${id}"]`);return}   // fold / open a group card
    else if(t.dataset.addto){S.addGrp=t.dataset.addto;render();const n=$('name');if(n){n.scrollIntoView({block:'center'});n.focus()}return}   // "+ Add habit" on a group card: the add form with that group chosen
    else if(t.dataset.grpup||t.dataset.grpdown){const id=t.dataset.grpup||t.dataset.grpdown,up=!!t.dataset.grpup;
      S.grps=moveGrp(S.grps,id,up?-1:1);save();render();
      const b=document.querySelector(`[data-grp${up?'up':'down'}="${id}"]:not([disabled])`)||document.querySelector(`[data-grp${up?'down':'up'}="${id}"]`);if(b)b.focus();return}
    else if(t.dataset.grpdel){const id=t.dataset.grpdel,g=S.grps.find(x=>x.id===id);if(!g)return;
      const n=S.habits.filter(h=>h.grp===id).length;
      if(!confirm('Delete the group “'+g.name+'”?'+(n?' Its '+n+' habit'+(n===1?'':'s')+' stay in the category.':'')))return;
      S.habits.forEach(h=>{if(h.grp===id)delete h.grp});S.grps=renumberGrps(S.grps.filter(x=>x.id!==id))}
    else if(t.dataset.hmode){setMode(t.dataset.hmode);render();   // All / Daily only / Periods only: remembered on this device; focus stays on the same switch
      const b=document.querySelector(`[data-hmode="${t.dataset.hmode}"][data-hmfor="${t.dataset.hmfor}"]`);if(b)b.focus();return}
    else return;
    save();render()});
  $('add').addEventListener('submit',e=>{e.preventDefault();const v=$('name').value.trim();if(!v)return;
    S.habits.push(newHabit(v));$('name').value='';save();render()});
  document.addEventListener('change',e=>{const t=e.target;
    if(t.dataset&&t.dataset.assign){(S.assignDraft=S.assignDraft||{})[t.dataset.assign]=t.value}
    else if(t.id==='assignAll'&&t.value){S.assignDraft=S.assignDraft||{};unassigned(S.habits,S.cats).forEach(h=>{S.assignDraft[h.id]=t.value});render()}});
  document.addEventListener('input',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;
    if(e.target.id==='goalAmt'){const g=Number(e.target.value);   // applies from the chosen day (today by default); earlier days keep their goal
      if(!(g>0)||!setGoal(h,g,S.goalFrom&&S.goalFrom.id===h.id?S.goalFrom.k:K(T())))return}
    else if(e.target.id==='unitIn'){const u=unitType(e.target.value);h.type=u.type;h.unit=u.unit}   // "min" / "hours" keep the minutes style, any other word is a plain number
    else if(e.target.id==='desc'){h.desc=e.target.value}
    else if(e.target.id==='sum'){draft().sum=e.target.value;markUnsaved();return}
    else if(e.target.dataset&&e.target.dataset.nt){draft().v[e.target.dataset.nt]=e.target.value;markUnsaved();return}
    else return;save()});
  // Category fields on the Manage page: saved as you type. An empty name is never accepted.
  document.addEventListener('input',e=>{const d=e.target.dataset||{},id=d.cname||d.cicon||d.ccolor;if(!id)return;
    const c=S.cats.find(x=>x.id===id);if(!c)return;
    if(d.cname){const v=e.target.value.trim();if(!v)return;c.name=v.slice(0,40)}
    else if(d.cicon)c.icon=e.target.value.trim().slice(0,8);
    else{c.color=e.target.value;const r=e.target.closest('.mrow');if(r)r.style.setProperty('--c',c.color)}
    save()});
  document.addEventListener('change',e=>{const d=e.target.dataset||{};
    if(d.cname){const c=S.cats.find(x=>x.id===d.cname);if(c)e.target.value=c.name}});   // blank name -> put the old one back
  document.addEventListener('submit',e=>{if(e.target.id!=='addcat')return;e.preventDefault();
    const name=$('newCatName').value.trim();if(!name)return;
    S.cats=renumber([...S.cats,{id:newCatId(),name:name.slice(0,40),color:$('newCatColor').value,icon:$('newCatIcon').value.trim().slice(0,8),order:S.cats.length}]);
    S.catMsg='Added “'+name+'”. It now shows on Home.';save();render();$('newCatName').focus()});
  // Groups (wird) on the Manage page: add, rename (saved as you type, an empty name is never accepted), and the group choice of the add form
  document.addEventListener('submit',e=>{const f=e.target;if(!f.classList||!f.classList.contains('addgrp'))return;e.preventDefault();
    const cat=f.dataset.gcat,name=f.querySelector('input').value.trim();if(!name||!S.cats.some(c=>c.id===cat))return;
    S.grps=renumberGrps([...S.grps,{id:newGrpId(),cat,name:name.slice(0,40),order:groupsOf(S.grps,cat).length}]);
    save();render();const nf=[...document.querySelectorAll('.addgrp')].find(x=>x.dataset.gcat===cat);if(nf)nf.querySelector('input').focus()});
  document.addEventListener('input',e=>{const id=e.target.dataset&&e.target.dataset.gname;if(!id)return;
    const g=S.grps.find(x=>x.id===id),v=e.target.value.trim();if(!g||!v)return;g.name=v.slice(0,40);save()});
  document.addEventListener('change',e=>{const id=e.target.dataset&&e.target.dataset.gname;
    if(id){const g=S.grps.find(x=>x.id===id);if(g)e.target.value=g.name}   // blank name -> put the old one back
    else if(e.target.id==='grp')S.addGrp=e.target.value});
  document.addEventListener('change',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;const id=e.target.id;
    if(id==='fqMode'){if(e.target.value==='p'){if(!h.stop)h.fq=cleanFreq(h.fq)||{n:3,per:'week'}}else delete h.fq;save();render();$('fqMode').focus();return}   // Every day removes the field
    if(id==='fqN'||id==='fqPer'){const cur=cleanFreq(h.fq)||{n:3,per:'week'},f=fqFrom(id==='fqN'?e.target.value:cur.n,id==='fqPer'?e.target.value:cur.per);
      if(f&&!h.stop)h.fq=f;save();render();$(id).focus();return}
    if(id==='impIn'){const n=Number(e.target.value);if(n>=1&&n<=5){h.importance=n;save();render();$('impIn').focus()}return}
    if(id==='goalFrom'){const v=e.target.value;if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&v<=K(T())){S.goalFrom={id:h.id,k:v};render();$('goalFrom').focus()}return}
    if(id==='moveCat'){if(S.cats.some(c=>c.id===e.target.value)){h.cat=e.target.value;delete h.grp;save();render();$('moveCat').focus()}return}   // a group belongs to one category, so the habit leaves its group
    if(id==='moveGrp'){const v=e.target.value;if(!v)delete h.grp;else if(S.grps.some(g=>g.id===v&&g.cat===h.cat))h.grp=v;else return;save();render();$('moveGrp').focus();return}
    if(id==='dayPick'&&e.target.value){S.day=e.target.value;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;render()}
    else if(id==='goalAmt'||id==='unitIn'){// redraw (percentages depend on the goal) but keep the cursor where it moved to
      setTimeout(()=>{const f=document.activeElement&&document.activeElement.id;render();const el=f&&$(f);
        if(el){el.focus();el.select()}},0)}// select all, like tabbing into a field normally does
    });
  document.addEventListener('input',e=>{const a=e.target.dataset&&e.target.dataset.amt;if(!a)return;
    const h=S.habits.find(x=>x.id===a.split('|')[0]);if(!h)return;
    const dk=a.split('|')[1],raw=e.target.value,v=raw===''?null:Math.max(0,Number(raw)||0);(S.draft=S.draft||{})[a]=v;
    const row=e.target.closest('.log'),p=v===null?null:pctOf(h,v,dk);
    row.querySelectorAll('.lv').forEach(b=>b.setAttribute('aria-pressed',v!==null&&Math.abs(shortAmt(h,SHORT[+b.dataset.lvl.split('|')[2]],dk)-v)<1e-9));
    // the little square next to the box: the colour this day's square will get, changing with every keystroke
    const sim=row.querySelector('.sim');if(sim){const g=p===null?null:paint(p,true);sim.className='sim'+(g?' '+g.cls:'');if(g&&g.style)sim.setAttribute('style',g.style);else sim.removeAttribute('style')}
    row.querySelector('.lvname').textContent=p===null?'Not logged':logPct(h,v,dk);markUnsaved(row)});
  // Text habit on the Category page: the text of the day is kept as a draft until Save
  document.addEventListener('input',e=>{const a=e.target.dataset&&e.target.dataset.txt;if(!a)return;
    (S.draft=S.draft||{})[a+'#t']=e.target.value;markUnsaved(e.target.closest('.log'))});

  // Day page: the date box jumps to that day (never into the future)
  document.addEventListener('change',e=>{if(e.target.id!=='dayJump')return;const v=e.target.value,today=K(T());
    if(/^\d{4}-\d{2}-\d{2}$/.test(v))navigate(href.day(v>today?today:v))});

  // Totals for a date range (Category and Habit pages): the result updates as the dates change; "Last month" goes back to the first range
  document.addEventListener('input',e=>{const r=e.target.dataset&&e.target.dataset.range;if(r)refreshRange(r.split('|')[0])});
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-rangereset]');if(b)resetRange(b.dataset.rangereset)});

  // Theme (light/dark)
  const root=document.documentElement;
  const isDark=()=>root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
  const paintTheme=()=>{$('theme').textContent=isDark()?'☀ Light mode':'☾ Dark mode'};
  $('theme').addEventListener('click',()=>{const t=isDark()?'light':'dark';root.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}paintTheme()});
  paintTheme();
  $('newFqMode').addEventListener('change',syncFq);$('newFqPer').addEventListener('change',syncFq);$('newFqN').addEventListener('input',syncFq);
  $('type').addEventListener('change',syncForm);$('stop').addEventListener('change',syncForm);$('unit').addEventListener('input',()=>{$('goalUnit').textContent=$('unit').value.trim()});syncForm();
  initDrag();
  document.addEventListener('change',e=>{if(e.target.classList&&e.target.classList.contains('skipReason'))e.target.closest('.skippanel').querySelector('input').hidden=e.target.value!=='Other…'});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.target.id==='nameIn'||e.target.id==='sum')){e.preventDefault();const b=document.querySelector(e.target.id==='sum'?'[data-saveday]':'[data-rename]');if(b)b.click()}});

  // Sign in / create account / reset password / sign out
  $('login').addEventListener('submit',e=>{e.preventDefault();msg('');signIn($('email').value,$('pass').value).catch(authErr)});
  $('signup').addEventListener('click',()=>{msg('');if(!$('login').reportValidity())return;signUp($('email').value,$('pass').value).catch(authErr)});
  $('out').addEventListener('click',()=>logOut());
  $('reset').addEventListener('click',()=>{msg('');const m=$('email').value.trim();if(!m){msg('Enter your email above, then press "Forgot password?" again.');return}
    sendReset(m).then(()=>msg('If an account exists for '+m+', a reset link is on its way. Check your spam folder too.')).catch(authErr)});

  // Backup: export all habits to a JSON file, import merges by habit id (imported copy wins)
  $('exp').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({app:'habit-tracker',version:3,exported:new Date().toISOString(),categories:S.cats,groups:S.grps,habits:S.habits},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='habits-'+K(T())+'.json';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  $('imp').addEventListener('click',()=>$('impFile').click());
  $('impFile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
    let good=[],impCats=[],impGrps=[];
    try{const j=JSON.parse(await f.text());good=(Array.isArray(j)?j:j.habits||[]).map(cleanHabit).filter(Boolean);impCats=Array.isArray(j)?[]:cleanCats(j.categories);impGrps=Array.isArray(j)?[]:cleanGrps(j.groups)}catch(err){}
    if(!good.length){alert('That file is not a valid habit backup.');return}
    if(!confirm('Import '+good.length+' habit'+(good.length===1?'':'s')+(impCats.length?' and '+impCats.length+' categor'+(impCats.length===1?'y':'ies'):'')+'? Items with the same ID will be replaced by the imported copy.'))return;
    const byId=new Map(S.habits.map(h=>[h.id,h]));good.forEach(h=>byId.set(h.id,h));
    S.habits=[...byId.values()];S.cats=mergeCats(S.cats,impCats);S.grps=mergeGrps(S.grps,impGrps,S.cats);save();render()});
  addEventListener('offline',()=>setSync('Offline · changes are saved on this device'));
  addEventListener('online',()=>{setSync('Back online · syncing…');syncNow()});
}
