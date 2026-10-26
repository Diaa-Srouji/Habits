// All user-input wiring: forms, buttons, theme/palette, sign-in, backup.
import {S} from './state.js';
import {$,K,T} from './util.js';
import {TYPES,LN,levelOf,levelAmt,setAmt,cleanHabit} from './scoring.js';
import {render,renderNotes} from './render.js';
import {unassigned,cleanCats,mergeCats,moveCat,renumber,newCatId} from './categories.js';
import {hidePop} from './heatmap.js';
import {navigate,href} from './router.js';
import {save,setSync,syncNow,signIn,signUp,logOut,sendReset} from './sync.js';

function newHabit(name){const type=$('type').value,stop=$('stop').checked&&!$('stopWrap').hidden;
  let unit=TYPES[type].unit;if(type==='pages'||type==='problems')unit=$('sub').value;
  const g=Number($('goal').value),goal=type==='bool'?1:(g>0?g:(stop?TYPES[type].stop:TYPES[type].goal));
  const cv=$('cat').value,cat=S.cats.some(c=>c.id===cv)?cv:S.cats[0].id;
  return {id:'h'+Date.now().toString(36),name,cat,type,stop,goal,unit,created:K(T()),done:{},skip:{},notes:{}}}
function syncForm(typeChanged){const type=$('type').value,canStop=['min','hour','pages','bool'].includes(type);
  $('stopWrap').hidden=!canStop;if(!canStop)$('stop').checked=false;
  const stop=$('stop').checked,subs={pages:[['pages','Pages'],['chapters','Chapters']],problems:[['problems solved','Solved'],['problems tried','Tried']]}[type];
  $('sub').hidden=!subs;if(subs&&typeChanged)$('sub').innerHTML=subs.map(s=>`<option value="${s[0]}">${s[1]}</option>`).join('');
  $('goalWrap').hidden=type==='bool';$('goalLbl').textContent=stop?'Daily limit':'Daily goal';
  $('goal').value=stop?TYPES[type].stop:TYPES[type].goal;$('goalUnit').textContent=subs?'':TYPES[type].unit}
function markUnsaved(row){S.saved=false;const ss=$('savestate');if(ss)ss.textContent='Unsaved changes';const u=row&&row.querySelector('.uns');if(u)u.textContent='Unsaved'}
function saveDay(h,k){const dk=h.id+'|'+k;if(S.draft&&dk in S.draft){setAmt(h,k,S.draft[dk]);delete S.draft[dk]}
  const n=$('note');if(n){const v=n.value;if(v.trim())h.notes[k]=v;else delete h.notes[k]}S.noteDraft=null;S.saved=true}

const msg=t=>{$('msg').textContent=t};
const authErr=e=>msg(({'auth/invalid-credential':'Wrong email or password.','auth/email-already-in-use':'That email already has an account. Sign in instead.','auth/weak-password':'Use a password with at least 6 characters.','auth/invalid-email':'Enter a valid email address.','auth/operation-not-allowed':'Email sign-in is not enabled in Firebase yet.','auth/missing-email':'Enter your email first.','auth/too-many-requests':'Too many attempts. Try again in a few minutes.','auth/network-request-failed':'No connection. Check your internet and try again.'})[e.code]||'Could not sign in ('+e.code+').');

export function initEvents(){
  document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
    if(t.dataset.assignsave){const d=S.assignDraft||{},need=unassigned(S.habits,S.cats),miss=need.filter(h=>!S.cats.some(c=>c.id===d[h.id]));
      if(miss.length){$('assignmsg').textContent='Choose a category for every habit ('+miss.length+' left).';return}
      need.forEach(h=>{h.cat=d[h.id]});S.assignDraft=null}
    else if(t.dataset.lvl){const [id,k,i]=t.dataset.lvl.split('|');const h=S.habits.find(x=>x.id===id);if(h){(S.draft=S.draft||{})[id+'|'+k]=levelAmt(h,+i);S.saved=false}}
    else if(t.dataset.skipopen){S.skipFor=t.dataset.skipopen}
    else if(t.dataset.skipcancel){S.skipFor=null}
    else if(t.dataset.skipgo){const [id,k]=t.dataset.skipgo.split('|'),h=S.habits.find(x=>x.id===id);
      if(h){const pn=t.closest('.skippanel');let r=pn.querySelector('select').value;if(r==='Other…')r=pn.querySelector('input').value.trim()||'Other';
        h.off=h.off||{};h.off[k]=r;delete h.done[k];delete h.skip[k];if(k<h.created)h.created=k;if(S.draft)delete S.draft[t.dataset.skipgo]}S.skipFor=null}
    else if(t.dataset.unskip){const [id,k]=t.dataset.unskip.split('|'),h=S.habits.find(x=>x.id===id);if(h&&h.off)delete h.off[k]}
    else if(t.dataset.bool){const [id,k,val]=t.dataset.bool.split('|');(S.draft=S.draft||{})[id+'|'+k]=+val;S.saved=false}
    else if(t.dataset.save){const [id,k]=t.dataset.save.split('|');const h=S.habits.find(x=>x.id===id);if(h){if(S.draft&&t.dataset.save in S.draft){setAmt(h,k,S.draft[t.dataset.save]);delete S.draft[t.dataset.save]}}}
    else if(t.dataset.saveday){const h=S.habits.find(x=>x.id===S.open);if(h)saveDay(h,S.day)}
    else if(t.dataset.rename){const h=S.habits.find(x=>x.id===S.open),v=$('nameIn').value.trim();if(h&&v)h.name=v}
    else if(t.dataset.day){if(S.open){S.day=t.dataset.day;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false}else{return}}
    else if(t.dataset.editday){const [id,k]=t.dataset.editday.split('|');// open that habit's page on that day
      S.day=k;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;hidePop();
      S.keepDay=navigate(href.habit(id));if(S.keepDay)return;window.scrollTo(0,0)}
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
      mine.forEach(h=>{h.cat=to});S.cats=renumber(S.cats.filter(c=>c.id!==id));S.delCat=null}
    else if(t.dataset.rm){const h=S.habits.find(x=>x.id===t.dataset.rm);if(!h||!confirm('Delete "'+h.name+'" and all its history forever? This cannot be undone. (Archive keeps it instead.)'))return;
      S.habits=S.habits.filter(x=>x.id!==t.dataset.rm)}
    else return;
    save();render()});
  $('add').addEventListener('submit',e=>{e.preventDefault();const v=$('name').value.trim();if(!v)return;
    S.habits.push(newHabit(v));$('name').value='';save();render()});
  document.addEventListener('change',e=>{const t=e.target;
    if(t.dataset&&t.dataset.assign){(S.assignDraft=S.assignDraft||{})[t.dataset.assign]=t.value}
    else if(t.id==='assignAll'&&t.value){S.assignDraft=S.assignDraft||{};unassigned(S.habits,S.cats).forEach(h=>{S.assignDraft[h.id]=t.value});render()}});
  document.addEventListener('input',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;
    if(e.target.id==='goalAmt'){const g=Number(e.target.value);if(g>0)h.goal=g;else return}
    else if(e.target.id==='unitIn'){h.unit=e.target.value.trim()||'min'}
    else if(e.target.id==='desc'){h.desc=e.target.value}
    else if(e.target.id==='note'){S.noteDraft={k:S.day,v:e.target.value};markUnsaved();return}
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
  document.addEventListener('change',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;const id=e.target.id;
    if(id==='moveCat'){if(S.cats.some(c=>c.id===e.target.value)){h.cat=e.target.value;save();render();$('moveCat').focus()}return}
    if(id==='dayPick'&&e.target.value){S.day=e.target.value;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;render()}
    else if(id==='goalAmt'||id==='unitIn'){// redraw (levels depend on the goal) but keep the cursor where it moved to
      setTimeout(()=>{const f=document.activeElement&&document.activeElement.id;render();const el=f&&$(f);
        if(el){el.focus();el.select()}},0)}// select all, like tabbing into a field normally does
    else if(id==='note')renderNotes(h)});
  document.addEventListener('input',e=>{const a=e.target.dataset&&e.target.dataset.amt;if(!a)return;
    const h=S.habits.find(x=>x.id===a.split('|')[0]);if(!h)return;
    const raw=e.target.value,v=raw===''?null:Math.max(0,Number(raw)||0);(S.draft=S.draft||{})[a]=v;
    const row=e.target.closest('.log'),lv=v===null?-1:levelOf(h,v);
    row.querySelectorAll('.lv').forEach((b,i)=>b.setAttribute('aria-pressed',i===lv));
    row.querySelector('.lvname').textContent=lv<0?'Not logged':LN[lv];markUnsaved(row)});

  // Theme (light/dark) and heatmap palette
  const root=document.documentElement;
  const isDark=()=>root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
  const paintTheme=()=>{$('theme').textContent=isDark()?'☀ Light mode':'☾ Dark mode'};
  $('theme').addEventListener('click',()=>{const t=isDark()?'light':'dark';root.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}paintTheme()});
  paintTheme();
  $('type').addEventListener('change',()=>syncForm(true));$('stop').addEventListener('change',()=>syncForm(false));syncForm(true);
  $('palette').value=document.documentElement.dataset.palette||'gradient';
  $('palette').addEventListener('change',e=>{const p=e.target.value;document.documentElement.dataset.palette=p;try{localStorage.setItem('palette',p)}catch(x){}render()});
  document.addEventListener('change',e=>{if(e.target.classList&&e.target.classList.contains('skipReason'))e.target.closest('.skippanel').querySelector('input').hidden=e.target.value!=='Other…'});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='nameIn'){e.preventDefault();const b=document.querySelector('[data-rename]');if(b)b.click()}});

  // Sign in / create account / reset password / sign out
  $('login').addEventListener('submit',e=>{e.preventDefault();msg('');signIn($('email').value,$('pass').value).catch(authErr)});
  $('signup').addEventListener('click',()=>{msg('');if(!$('login').reportValidity())return;signUp($('email').value,$('pass').value).catch(authErr)});
  $('out').addEventListener('click',()=>logOut());
  $('reset').addEventListener('click',()=>{msg('');const m=$('email').value.trim();if(!m){msg('Enter your email above, then press "Forgot password?" again.');return}
    sendReset(m).then(()=>msg('If an account exists for '+m+', a reset link is on its way. Check your spam folder too.')).catch(authErr)});

  // Backup: export all habits to a JSON file, import merges by habit id (imported copy wins)
  $('exp').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({app:'habit-tracker',version:2,exported:new Date().toISOString(),categories:S.cats,habits:S.habits},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='habits-'+K(T())+'.json';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  $('imp').addEventListener('click',()=>$('impFile').click());
  $('impFile').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
    let good=[],impCats=[];
    try{const j=JSON.parse(await f.text());good=(Array.isArray(j)?j:j.habits||[]).map(cleanHabit).filter(Boolean);impCats=Array.isArray(j)?[]:cleanCats(j.categories)}catch(err){}
    if(!good.length){alert('That file is not a valid habit backup.');return}
    if(!confirm('Import '+good.length+' habit'+(good.length===1?'':'s')+(impCats.length?' and '+impCats.length+' categor'+(impCats.length===1?'y':'ies'):'')+'? Items with the same ID will be replaced by the imported copy.'))return;
    const byId=new Map(S.habits.map(h=>[h.id,h]));good.forEach(h=>byId.set(h.id,h));
    S.habits=[...byId.values()];S.cats=mergeCats(S.cats,impCats);save();render()});
  addEventListener('offline',()=>setSync('Offline · changes are saved on this device'));
  addEventListener('online',()=>{setSync('Back online · syncing…');syncNow()});
}
