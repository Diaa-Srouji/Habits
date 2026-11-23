// All user-input wiring: forms, buttons, folding, Statistics presets & habit picker, Day page inline editing, nested groups, hh:mm, theme, sign-in, backup.
import {S} from './state.js';
import {$,K,T} from './util.js';
import {cleanFreq,freqText,freeze,unfreeze,unfreezeDay,setGoal,TYPES,unitType,SHORT,shortAmt,pctOf,paint,logPct,setAmt,cleanHabit,addNote,setNote,delNote,moveNote,resetNoteOrder,pruneEmpty,fmtHHMM,parseHHMM,setReq,delReq,skipReqPeriod,unskipReqPeriod} from './scoring.js';
import {parseCodeDB,parseCategoryText,parseHabitText} from './codedb.js';
import {render,refreshRange,setRangePreset,syncAddGroups} from './render.js';
import {unassigned,cleanCats,mergeCats,moveCat,renumber,newCatId,cleanGrps,mergeGrps,renumberGrps,moveGrp,newGrpId,childGroups,live} from './categories.js';
import {hidePop,setMode} from './heatmap.js';
import {navigate,href} from './router.js';
import {save,signIn,signUp,logOut,sendReset} from './sync.js';
import {initDrag} from './drag.js';

const fqFrom=(n,per)=>cleanFreq({n:Math.min(Math.max(Math.round(Number(n))||1,1),per==='days'?365:99),per});
function newHabit(name){const kind=$('type').value,stop=$('stop').checked;
  const fq=!stop&&$('newFqMode').value==='p'?fqFrom($('newFqN').value,$('newFqPer').value):undefined;
  let type='num',unit='',goal=1;
  if(kind==='bool'){type='bool'}
  else if(kind==='text'){type='text';unit='%';goal=100}
  else{const u=unitType($('unit').value),raw=$('goal').value,g=u.type==='min'?parseHHMM(raw):Number(raw);
    type=u.type;unit=u.unit;goal=g>0?g:(stop?TYPES[type].stop:TYPES[type].goal)}
  const cv=$('cat').value,cat=S.cats.some(c=>c.id===cv)?cv:S.cats[0].id;
  const gv=$('grp').value,grp=!$('grp').hidden&&S.grps.some(g=>g.id===gv&&g.cat===cat)?gv:null;
  return {id:'h'+Date.now().toString(36),name,cat,...(grp?{grp}:{}),...(fq?{fq}:{}),type,stop,goal,unit,importance:Number($('impt').value)||3,created:K(T()),done:{},skip:{},notes:{},gl:type==='bool'||type==='text'?{}:{[K(T())]:goal}}}

function syncFq(){const stop=$('stop').checked,m=$('newFqMode'),per=$('newFqPer').value;
  if(stop)m.value='';m.disabled=stop;
  const on=m.value==='p'&&!stop;$('newFqBox').hidden=!on;
  const f=on?fqFrom($('newFqN').value,per):null;
  $('newFqPrev').textContent=stop?'Stop habits are daily only.':on&&f?'Shown as “'+freqText({fq:f})+'”. Only a label.':''}

function syncGoalInput(resetVal=false){
  const kind=$('type').value,stop=$('stop').checked,g=$('goal');
  if(kind!=='num')return;
  const u=unitType($('unit').value),isM=u.type==='min';
  if(isM){
    const changed=g.type!=='text';
    g.type='text';g.inputMode='numeric';g.placeholder='hh:mm';
    if(changed||resetVal)g.value=fmtHHMM(stop?TYPES.min.stop:TYPES.min.goal);
  }else{
    const changed=g.type!=='number';
    g.type='number';g.inputMode='decimal';g.placeholder='';
    if(changed||resetVal)g.value=stop?TYPES.num.stop:TYPES.num.goal;
  }
  $('goalUnit').textContent=isM?'(hh:mm)':$('unit').value.trim();
}
function syncForm(){const kind=$('type').value,stop=$('stop').checked,num=kind==='num';
  $('stopLbl').textContent=kind==='text'?'Stop habit (write only when you slip)':kind==='bool'?'Stop habit (avoid it)':'Stop habit (less is better, with a daily limit)';
  $('unit').hidden=!num;$('goalWrap').hidden=!num;
  $('goalLbl').textContent=stop?'Daily limit':'Daily goal';
  syncGoalInput(true);syncFq()}

function markUnsaved(row){S.saved=false;const ss=$('savestate');if(ss)ss.textContent='Unsaved changes';
  const u=row&&row.querySelector('.uns');if(u)u.textContent='Unsaved';
  const card=row&&row.closest&&row.closest('[data-daycard]');
  if(card){const du=card.querySelector('[data-dayuns]');if(du)du.textContent='Unsaved'}}

function saveDay(h,k){const dk=h.id+'|'+k;if(S.draft&&dk in S.draft){setAmt(h,k,S.draft[dk]);delete S.draft[dk]}
  const dr=S.noteDraft&&S.noteDraft.k===k?S.noteDraft:null;
  if(dr){if(dr.sum!==undefined){const v=dr.sum.trim();h.sum=h.sum||{};if(v)h.sum[k]=v;else delete h.sum[k]}
    for(const id in dr.v||{})setNote(h,k,id,dr.v[id])}
  pruneEmpty(h,null);
  S.noteDraft=null;S.saved=true}

function ensureDayDraft(hid,k){
  const dk=hid+'|'+k;
  S.dayDrafts=S.dayDrafts||{};
  if(!S.dayDrafts[dk])S.dayDrafts[dk]={v:{}};
  if(!S.dayDrafts[dk].v)S.dayDrafts[dk].v={};
  return S.dayDrafts[dk];
}

function saveDayCard(h,k){
  const dk=h.id+'|'+k;
  if(S.draft&&dk in S.draft){setAmt(h,k,S.draft[dk]);delete S.draft[dk]}
  const dr=S.dayDrafts?S.dayDrafts[dk]:null;
  if(dr){
    if(dr.sum!==undefined){const v=dr.sum.trim();h.sum=h.sum||{};if(v)h.sum[k]=v;else delete h.sum[k]}
    for(const id in dr.v||{})setNote(h,k,id,dr.v[id]);
    delete S.dayDrafts[dk];
  }
  if(S.keepNoteDay===k)S.keepNoteDay=null;
  pruneEmpty(h,null);
  S.daySaved=dk;
}

const draft=()=>{if(!S.noteDraft||S.noteDraft.k!==S.day)S.noteDraft={k:S.day,v:{}};if(!S.noteDraft.v)S.noteDraft.v={};return S.noteDraft};
const openHabit=()=>S.habits.find(x=>x.id===S.open);
const focusSel=q=>{const el=document.querySelector(q);if(el)el.focus();return !!el};

const msg=t=>{$('msg').textContent=t};
const authErr=e=>msg(({'auth/invalid-credential':'Wrong email or password.','auth/email-already-in-use':'That email already has an account. Sign in instead.','auth/weak-password':'Use a password with at least 6 characters.','auth/invalid-email':'Enter a valid email address.','auth/operation-not-allowed':'Email sign-in is not enabled in Firebase yet.','auth/missing-email':'Enter your email first.','auth/too-many-requests':'Too many attempts. Try again in a few minutes.','auth/network-request-failed':'No connection. Check your internet and try again.'})[e.code]||'Could not sign in ('+e.code+').');

export function initEvents(){
  document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
    
    
    // Inline Text DB on Habit & Category pages: Apply & Sync / Reset
    if(t.dataset.txtapply){
      const tKey=t.dataset.txtapply,i=tKey.indexOf(':'),sc=tKey.slice(0,i),id=tKey.slice(i+1),y=scrollY;
      const ed=[...document.querySelectorAll('[data-txted]')].find(el=>el.dataset.txted===tKey);
      if(!ed)return;
      S.txtDraft=S.txtDraft||{};
      if(sc==='h'){
        const h=S.habits.find(x=>x.id===id);if(!h)return;
        const res=parseHabitText(ed.value,h,S);
        if(!res.ok){S.txtDraft[tKey]={text:ed.value,errors:res.errors,msg:''};render();window.scrollTo(0,y);return}
        const idx=S.habits.findIndex(x=>x.id===id);
        if(idx>=0)S.habits[idx]=res.habit;
        S.grps=res.grps;
        S.txtDraft[tKey]={errors:[],msg:'Applied & synced ✓'};
        save();render();window.scrollTo(0,y);return;
      }
      if(sc==='c'){
        const c=S.cats.find(x=>x.id===id);if(!c)return;
        const res=parseCategoryText(ed.value,c,S);
        if(!res.ok){S.txtDraft[tKey]={text:ed.value,errors:res.errors,msg:''};render();window.scrollTo(0,y);return}
        const ci=S.cats.findIndex(x=>x.id===id);
        if(ci>=0)S.cats[ci]=res.cat;
        S.grps=res.grps;S.habits=res.habits;
        S.txtDraft[tKey]={errors:[],msg:'Applied & synced ✓'};
        save();render();window.scrollTo(0,y);return;
      }
    }
    if(t.dataset.txtreset){
      const tKey=t.dataset.txtreset,y=scrollY;
      if(S.txtDraft)delete S.txtDraft[tKey];
      render();window.scrollTo(0,y);return;
    }

    // Code DB: Apply & Sync / Reset
    if(t.dataset.codeapply){
      const ed=$('codeEditor');if(!ed)return;
      const res=parseCodeDB(ed.value,S);
      if(!res.ok){S.codeDraft=ed.value;S.codeErrors=res.errors;S.codeMsg='';render();return}
      S.cats=res.cats;S.grps=res.grps;S.habits=res.habits;
      S.codeDraft=null;S.codeErrors=[];S.codeMsg='Applied & synced ✓';
      save();render();return;
    }
    if(t.dataset.codereset){
      S.codeDraft=null;S.codeErrors=[];S.codeMsg='Reset to current database.';render();return;
    }
    // Required days: set / turn off from date / delete entry / skip period / undo skip
    if(t.dataset.rqsave){
      const h=openHabit();if(!h)return;
      const per=$('rqPer')?.value,from=$('rqFrom')?.value||K(T()),yPos=scrollY;
      if(!per){setReq(h,{per:'none'},from);save();render();window.scrollTo(0,yPos);return}
      const x=Number($('rqX')?.value),y=Number($('rqY')?.value||7);
      if(!setReq(h,per==='days'?{x,per:'days',y}:{x,per},from)){alert('Enter valid required days (e.g. 5/week, 20/month, or X <= Y days).');return}
      save();render();window.scrollTo(0,yPos);return;
    }
    if(t.dataset.rqdel){
      const h=openHabit(),yPos=scrollY;if(!h)return;
      delReq(h,t.dataset.rqdel);save();render();window.scrollTo(0,yPos);return;
    }
    if(t.dataset.rqskip){
      const [id,pKey]=t.dataset.rqskip.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;
      if(!h)return;
      const reason=prompt('Reason for skipping req for this period (optional):','');
      if(reason===null)return;
      skipReqPeriod(h,pKey,reason||'Skipped');save();render();window.scrollTo(0,y);return;
    }
    if(t.dataset.rqunskip){
      const [id,pKey]=t.dataset.rqunskip.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;
      if(!h)return;
      unskipReqPeriod(h,pKey);save();render();window.scrollTo(0,y);return;
    }

    
    // Edit habits: Fold all / Expand all tree
    if(t.dataset.mfoldall!==undefined){
      const fold=t.dataset.mfoldall==='1',y=scrollY;
      S.fold=S.fold||{};
      S.cats.forEach(c=>{S.fold['mcat:'+c.id]=fold});
      S.grps.forEach(g=>{S.fold['mgrp:'+g.id]=fold});
      render();window.scrollTo(0,y);return;
    }
    // Edit habits: "+ Habit" inside a specific category or group
    if(t.dataset.maddhabit!==undefined){
      const [cid,gid]=t.dataset.maddhabit.split('|');
      S.fold=S.fold||{};S.fold['m:add']=false;
      S.addGrp=gid||'';
      render();
      if($('cat')&&S.cats.some(c=>c.id===cid)){$('cat').value=cid;syncAddGroups()}
      const n=$('name');if(n){n.scrollIntoView({behavior:'smooth',block:'center'});n.focus()}
      return;
    }

    // Universal fold / expand (Day page, Category, Habit, Home, Statistics)
    if(t.dataset.fold){
      const key=t.dataset.fold,y=scrollY,willFold=t.getAttribute('aria-expanded')==='true';
      S.fold=S.fold||{};
      S.fold[key]=willFold;
      render();
      if(key==='m:add'&&!willFold){const n=$('name');if(n){n.scrollIntoView({behavior:'smooth',block:'center'});n.focus()}return}
      if(key==='m:addcat'&&!willFold){const n=$('newCatName');if(n)n.focus();return}
      window.scrollTo(0,y);return;
    }
    if(t.dataset.foldall!==undefined){
      const fold=t.dataset.foldall==='1',y=scrollY;
      S.fold=S.fold||{};
      S.cats.forEach(c=>{S.fold['cat:'+c.id]=fold});
      S.grps.forEach(g=>{S.fold['grp:'+g.id]=fold});
      live(S.habits).forEach(h=>{S.fold['hab:'+h.id]=fold;S.fold['hm:'+h.id]=fold;S.fold['nt:'+h.id]=fold});
      render();window.scrollTo(0,y);return;
    }
    // Statistics date presets (All time / Last month)
    if(t.dataset.rangepreset){
      const [key,preset]=t.dataset.rangepreset.split('|');
      setRangePreset(key,preset);return;
    }
    // Home Statistics habit selector (All / Clear)
    if(t.dataset.statpick){
      const y=scrollY;
      S.statPick=t.dataset.statpick==='all'?null:[];
      render();window.scrollTo(0,y);return;
    }
    // Day page: save one habit card
    if(t.dataset.daysave){
      const [id,k]=t.dataset.daysave.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;
      if(h){saveDayCard(h,k);save();render();window.scrollTo(0,y)}return;
    }
    // Day page: add / delete / move / reset notes inline
    if(t.dataset.dayntadd){
      const [id,k]=t.dataset.dayntadd.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;
      if(!h)return;
      const nid=addNote(h,k);
      S.keepNoteDay=k;
      S.fold=S.fold||{};S.fold[t.dataset.ntkey||('nt:'+h.id)]=false;
      save();render();window.scrollTo(0,y);focusSel(`[data-daynt="${id}|${k}|${nid}"]`);return;
    }
    if(t.dataset.dayntdel){
      const [id,k,nid]=t.dataset.dayntdel.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;
      if(!h||!confirm('Delete this note? This cannot be undone.'))return;
      delNote(h,k,nid);
      if(S.dayDrafts&&S.dayDrafts[id+'|'+k]&&S.dayDrafts[id+'|'+k].v)delete S.dayDrafts[id+'|'+k].v[nid];
      save();render();window.scrollTo(0,y);return;
    }
    // Log all days: Show more / Fold all days
    if(t.dataset.almore){
      const [sk,nStr]=t.dataset.almore.split('|'),y=scrollY;
      S.alLimit=S.alLimit||{};
      const cur=S.alLimit[sk]||14,n=Number(nStr)||14;
      S.alLimit[sk]=n>14?n:cur+n;
      render();window.scrollTo(0,y);return;
    }
    if(t.dataset.alfold){
      const sk=t.dataset.alfold,y=scrollY;
      S.fold=S.fold||{};
      for(const k in S.fold)if(k.startsWith('ald:'+sk+':')||k.startsWith('al:'+sk+':'))S.fold[k]=true;
      render();window.scrollTo(0,y);return;
    }
    if(t.dataset.dayntup||t.dataset.dayntdown){
      const ref=t.dataset.dayntup||t.dataset.dayntdown,up=!!t.dataset.dayntup,[id,k,nid]=ref.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;
      if(!h)return;
      moveNote(h,k,nid,up?-1:1);save();render();window.scrollTo(0,y);return;
    }
    if(t.dataset.dayntreset){
      const [id,k]=t.dataset.dayntreset.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;
      if(!h)return;
      resetNoteOrder(h,k);save();render();window.scrollTo(0,y);return;
    }

    // UI-only actions (no cloud write needed)
    if(t.dataset.lvl){const [id,k,i]=t.dataset.lvl.split('|'),h=S.habits.find(x=>x.id===id),y=scrollY;if(h){(S.draft=S.draft||{})[id+'|'+k]=shortAmt(h,SHORT[+i],k);S.saved=false;S.daySaved=null;render();window.scrollTo(0,y)}return}
    if(t.dataset.bool){const [id,k,val]=t.dataset.bool.split('|'),y=scrollY;(S.draft=S.draft||{})[id+'|'+k]=+val;S.saved=false;S.daySaved=null;render();window.scrollTo(0,y);return}
    if(t.dataset.skipopen){const y=scrollY;S.skipFor=t.dataset.skipopen;render();window.scrollTo(0,y);return}
    if(t.dataset.skipcancel){const y=scrollY;S.skipFor=null;render();window.scrollTo(0,y);return}
    if(t.dataset.catdel){const y=scrollY;S.delCat=t.dataset.catdel;render();window.scrollTo(0,y);return}
    if(t.dataset.catdelcancel){const y=scrollY;S.delCat=null;render();window.scrollTo(0,y);return}
    if(t.dataset.grptoggle){const id=t.dataset.grptoggle,y=scrollY;(S.shut=S.shut||{})[id]=!S.shut[id];render();window.scrollTo(0,y);focusSel(`[data-grptoggle="${id}"]`);return}
    if(t.dataset.day){if(S.open){S.day=t.dataset.day;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;S.fold=S.fold||{};S.fold['hed:'+S.open]=false;render();const dp=$('dayPick');if(dp)dp.scrollIntoView({behavior:'smooth',block:'nearest'})}return}
    if(t.dataset.editday){const [id,k]=t.dataset.editday.split('|');
      S.day=k;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;S.fold=S.fold||{};S.fold['hed:'+id]=false;hidePop();
      S.keepDay=navigate(href.habit(id));if(S.keepDay)return;render();window.scrollTo(0,0);return}
    if(t.dataset.hmode){const y=scrollY;setMode(t.dataset.hmode);render();window.scrollTo(0,y);
      const b=document.querySelector(`[data-hmode="${t.dataset.hmode}"][data-hmfor="${t.dataset.hmfor}"]`);if(b)b.focus();return}

    // Persisted mutations (save + render + preserve scroll)
    if(t.dataset.assignsave){const d=S.assignDraft||{},need=unassigned(S.habits,S.cats),miss=need.filter(h=>!S.cats.some(c=>c.id===d[h.id]));
      if(miss.length){$('assignmsg').textContent='Choose a category for every habit ('+miss.length+' left).';return}
      need.forEach(h=>{h.cat=d[h.id]});S.assignDraft=null}
    else if(t.dataset.skipgo){const [id,k]=t.dataset.skipgo.split('|'),h=S.habits.find(x=>x.id===id);
      if(h){const pn=t.closest('.skippanel');let r=pn.querySelector('select').value;if(r==='Other…')r=pn.querySelector('input').value.trim()||'Other';
        h.off=h.off||{};h.off[k]=r;delete h.done[k];delete h.skip[k];if(k<h.created)h.created=k;if(S.draft)delete S.draft[t.dataset.skipgo]}S.skipFor=null}
    else if(t.dataset.unskip){const [id,k]=t.dataset.unskip.split('|'),h=S.habits.find(x=>x.id===id);if(h&&h.off)delete h.off[k]}
    else if(t.dataset.save){const [id,k]=t.dataset.save.split('|');const h=S.habits.find(x=>x.id===id);if(h){if(S.draft&&t.dataset.save in S.draft){setAmt(h,k,S.draft[t.dataset.save]);delete S.draft[t.dataset.save]}
      const tk=t.dataset.save+'#t';if(S.draft&&tk in S.draft){const v=String(S.draft[tk]).trim();h.sum=h.sum||{};if(v)h.sum[k]=v;else delete h.sum[k];delete S.draft[tk]}}}
    else if(t.dataset.saveday){const h=S.habits.find(x=>x.id===S.open);if(h)saveDay(h,S.day)}
    else if(t.dataset.rename){const h=S.habits.find(x=>x.id===S.open),v=$('nameIn').value.trim();if(h&&v)h.name=v}
    else if(t.dataset.ntadd){const h=openHabit(),y=scrollY;if(!h)return;const id=addNote(h,S.day);save();render();window.scrollTo(0,y);focusSel(`[data-nt="${id}"]`);return}
    else if(t.dataset.ntdel){const h=openHabit(),y=scrollY;if(!h||!confirm('Delete this note? This cannot be undone.'))return;
      delNote(h,S.day,t.dataset.ntdel);if(S.noteDraft&&S.noteDraft.v)delete S.noteDraft.v[t.dataset.ntdel];save();render();window.scrollTo(0,y);focusSel('[data-ntadd]');return}
    else if(t.dataset.ntup||t.dataset.ntdown){const h=openHabit(),id=t.dataset.ntup||t.dataset.ntdown,up=!!t.dataset.ntup,y=scrollY;if(!h)return;
      moveNote(h,S.day,id,up?-1:1);save();render();window.scrollTo(0,y);
      focusSel(`[data-nt${up?'up':'down'}="${id}"]:not([disabled])`)||focusSel(`[data-nt${up?'down':'up'}="${id}"]`);return}
    else if(t.dataset.ntreset){const h=openHabit(),y=scrollY;if(!h)return;resetNoteOrder(h,S.day);save();render();window.scrollTo(0,y);focusSel('[data-ntadd]');return}
    else if(t.dataset.freeze){const h=S.habits.find(x=>x.id===t.dataset.freeze);if(!h||!freeze(h))return;if(S.draft)delete S.draft[h.id+'|'+K(T())];S.skipFor=null}
    else if(t.dataset.unfreezeday){const [id,k]=t.dataset.unfreezeday.split('|'),h=S.habits.find(x=>x.id===id);if(!h||!unfreezeDay(h,k))return}
    else if(t.dataset.unfreeze){const h=S.habits.find(x=>x.id===t.dataset.unfreeze);if(!h||!unfreeze(h))return}
    else if(t.dataset.archive){const h=S.habits.find(x=>x.id===t.dataset.archive);if(!h)return;
      h.archived=true;S.draft={};S.skipFor=null;if(S.open===h.id){save();navigate(href.cat(h.cat));return}}
    else if(t.dataset.restore){const h=S.habits.find(x=>x.id===t.dataset.restore);if(!h)return;delete h.archived}
    else if(t.dataset.catup||t.dataset.catdown){const id=t.dataset.catup||t.dataset.catdown,y=scrollY;
      S.cats=moveCat(S.cats,id,t.dataset.catup?-1:1);save();render();window.scrollTo(0,y);
      const b=document.querySelector(`[data-cat${t.dataset.catup?'up':'down'}="${id}"]:not([disabled])`)||document.querySelector(`[data-cat${t.dataset.catup?'down':'up'}="${id}"]`);if(b)b.focus();return}
    else if(t.dataset.catdelgo){const id=t.dataset.catdelgo,sel=$('delTarget'),to=sel?sel.value:null,mine=S.habits.filter(h=>h.cat===id);
      if(S.cats.length<2||(mine.length&&!S.cats.some(c=>c.id===to&&c.id!==id)))return;
      mine.forEach(h=>{h.cat=to;delete h.grp});S.grps=renumberGrps(S.grps.filter(g=>g.cat!==id));S.cats=renumber(S.cats.filter(c=>c.id!==id));S.delCat=null}
    else if(t.dataset.rm){const h=S.habits.find(x=>x.id===t.dataset.rm);if(!h||!confirm('Delete "'+h.name+'" and all its history forever? This cannot be undone.'))return;
      S.habits=S.habits.filter(x=>x.id!==t.dataset.rm)}
    else if(t.dataset.grpup||t.dataset.grpdown){const id=t.dataset.grpup||t.dataset.grpdown,up=!!t.dataset.grpup,y=scrollY;
      S.grps=moveGrp(S.grps,id,up?-1:1);save();render();window.scrollTo(0,y);
      const b=document.querySelector(`[data-grp${up?'up':'down'}="${id}"]:not([disabled])`)||document.querySelector(`[data-grp${up?'down':'up'}="${id}"]`);if(b)b.focus();return}
    else if(t.dataset.grpdel){const id=t.dataset.grpdel,g=S.grps.find(x=>x.id===id);if(!g)return;
      const n=S.habits.filter(h=>h.grp===id).length,kids=S.grps.filter(x=>x.parent===id).length;
      if(!confirm('Delete the group “'+g.name+'”?'+(n||kids?' Its habits and sub-groups move up one level.':'')))return;
      S.habits.forEach(h=>{if(h.grp===id){if(g.parent)h.grp=g.parent;else delete h.grp}});
      S.grps=renumberGrps(S.grps.filter(x=>x.id!==id).map(x=>x.parent===id?(g.parent?{...x,parent:g.parent}:{id:x.id,cat:x.cat,name:x.name,order:x.order}):x))}
    else return;
    const y=scrollY;save();render();window.scrollTo(0,y)});

  $('add').addEventListener('submit',e=>{e.preventDefault();const v=$('name').value.trim();if(!v)return;
    const nh=newHabit(v);S.habits.push(nh);$('name').value='';
    S.fold=S.fold||{};S.fold['mcat:'+nh.cat]=false;if(nh.grp)S.fold['mgrp:'+nh.grp]=false;
    save();render()});
  $('cat').addEventListener('change',()=>{S.addGrp='';syncAddGroups()});

  document.addEventListener('change',e=>{const t=e.target;
    if(t.dataset&&t.dataset.statcheck){
      const id=t.dataset.statcheck,allIds=live(S.habits).map(h=>h.id),y=scrollY;
      let set=new Set(S.statPick?S.statPick:allIds);
      if(t.checked)set.add(id);else set.delete(id);
      S.statPick=set.size===allIds.length?null:[...set];
      render();window.scrollTo(0,y);return;
    }
    if(t.dataset&&t.dataset.assign){(S.assignDraft=S.assignDraft||{})[t.dataset.assign]=t.value}
    else if(t.id==='assignAll'&&t.value){S.assignDraft=S.assignDraft||{};unassigned(S.habits,S.cats).forEach(h=>{S.assignDraft[h.id]=t.value});render()}});

  document.addEventListener('input',e=>{if(e.target.id==='codeEditor'){S.codeDraft=e.target.value;S.codeMsg='Unsaved edits'}else if(e.target.dataset&&e.target.dataset.txted){const k=e.target.dataset.txted;(S.txtDraft=S.txtDraft||{})[k]={text:e.target.value,errors:[],msg:'Unsaved edits'}}});

  // Day page: summary and note drafts
  document.addEventListener('input',e=>{
    const ds=e.target.dataset&&e.target.dataset.daysum;
    if(ds){const [hid,k]=ds.split('|');ensureDayDraft(hid,k).sum=e.target.value;S.daySaved=null;markUnsaved(e.target);return}
    const dn=e.target.dataset&&e.target.dataset.daynt;
    if(dn){const [hid,k,nid]=dn.split('|');ensureDayDraft(hid,k).v[nid]=e.target.value;S.daySaved=null;markUnsaved(e.target);return}
  });

  // Habit page fields
  document.addEventListener('input',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;
    if(e.target.id==='goalAmt'){const g=h.type==='min'?parseHHMM(e.target.value):Number(e.target.value);
      if(!(g>0)||!setGoal(h,g,S.goalFrom&&S.goalFrom.id===h.id?S.goalFrom.k:K(T())))return}
    else if(e.target.id==='unitIn'){const u=unitType(e.target.value);h.type=u.type;h.unit=u.unit}
    else if(e.target.id==='desc'){h.desc=e.target.value}
    else if(e.target.id==='sum'){draft().sum=e.target.value;markUnsaved();return}
    else if(e.target.dataset&&e.target.dataset.nt){draft().v[e.target.dataset.nt]=e.target.value;markUnsaved();return}
    else return;save()});

  document.addEventListener('input',e=>{const d=e.target.dataset||{},id=d.cname||d.cicon||d.ccolor;if(!id)return;
    const c=S.cats.find(x=>x.id===id);if(!c)return;
    const card=e.target.closest('.mcat,.mrow');
    if(d.cname){const v=e.target.value.trim();if(!v)return;c.name=v.slice(0,40);const nm=card&&card.querySelector('.mcat-name');if(nm)nm.textContent=c.name}
    else if(d.cicon){c.icon=e.target.value.trim().slice(0,8);const ic=card&&card.querySelector('.cb-icon');if(ic)ic.textContent=c.icon||'●'}
    else{c.color=e.target.value;if(card)card.style.setProperty('--c',c.color)}
    save()});
  document.addEventListener('change',e=>{const d=e.target.dataset||{};
    if(d.cname){const c=S.cats.find(x=>x.id===d.cname);if(c)e.target.value=c.name}});

  document.addEventListener('submit',e=>{if(e.target.id!=='addcat')return;e.preventDefault();
    const name=$('newCatName').value.trim();if(!name)return;
    S.cats=renumber([...S.cats,{id:newCatId(),name:name.slice(0,40),color:$('newCatColor').value,icon:$('newCatIcon').value.trim().slice(0,8),order:S.cats.length}]);
    S.catMsg='Added “'+name+'”. It now shows on Home.';save();render();$('newCatName').focus()});

  // Nested groups on Edit habits page (supports both <select> and <input type="hidden"> parent)
  document.addEventListener('submit',e=>{const f=e.target;if(!f.classList||!f.classList.contains('addgrp'))return;e.preventDefault();
    const cat=f.dataset.gcat,inp=f.querySelector('input[name="gname"]')||f.querySelector('input'),name=inp.value.trim();
    if(!name||!S.cats.some(c=>c.id===cat))return;
    const psel=f.querySelector('[name="parent"]'),parent=psel&&psel.value&&S.grps.some(g=>g.id===psel.value&&g.cat===cat)?psel.value:undefined;
    const g={id:newGrpId(),cat,name:name.slice(0,40),order:childGroups(S.grps,cat,parent||null).length,...(parent?{parent}:{})};
    S.grps=renumberGrps([...S.grps,g]);
    S.fold=S.fold||{};S.fold['mcat:'+cat]=false;if(parent)S.fold['mgrp:'+parent]=false;
    const y=scrollY;save();render();window.scrollTo(0,y)});

  document.addEventListener('input',e=>{const id=e.target.dataset&&e.target.dataset.gname;if(!id)return;
    const g=S.grps.find(x=>x.id===id),v=e.target.value.trim();if(!g||!v)return;g.name=v.slice(0,40);
    const gt=e.target.closest('.mgrp')?.querySelector(':scope > .mgrp-h .mgrp-title');if(gt)gt.textContent=g.name;save()});
  document.addEventListener('change',e=>{const id=e.target.dataset&&e.target.dataset.gname;
    if(id){const g=S.grps.find(x=>x.id===id);if(g)e.target.value=g.name}
    else if(e.target.id==='grp')S.addGrp=e.target.value});

  document.addEventListener('change',e=>{const h=S.habits.find(x=>x.id===S.open);if(!h)return;const id=e.target.id;
    if(id==='fqMode'){if(e.target.value==='p'){if(!h.stop)h.fq=cleanFreq(h.fq)||{n:3,per:'week'}}else delete h.fq;save();render();$('fqMode').focus();return}
    if(id==='fqN'||id==='fqPer'){const cur=cleanFreq(h.fq)||{n:3,per:'week'},f=fqFrom(id==='fqN'?e.target.value:cur.n,id==='fqPer'?e.target.value:cur.per);
      if(f&&!h.stop)h.fq=f;save();render();$(id).focus();return}
    if(id==='impIn'){const n=Number(e.target.value);if(n>=1&&n<=5){h.importance=n;save();render();$('impIn').focus()}return}
    if(id==='rqFrom'){const v=e.target.value;if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&v<=K(T())){S.reqFrom={id:h.id,k:v};render();$('rqFrom').focus()}return}
    if(id==='rqPer'){const yEl=$('rqY');if(yEl){yEl.hidden=e.target.value!=='days';if(!yEl.hidden)yEl.focus()}return}
    if(id==='goalFrom'){const v=e.target.value;if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&v<=K(T())){S.goalFrom={id:h.id,k:v};render();$('goalFrom').focus()}return}
    if(id==='moveCat'){if(S.cats.some(c=>c.id===e.target.value)){h.cat=e.target.value;delete h.grp;save();render();$('moveCat').focus()}return}
    if(id==='moveGrp'){const v=e.target.value;if(!v)delete h.grp;else if(S.grps.some(g=>g.id===v&&g.cat===h.cat))h.grp=v;else return;save();render();$('moveGrp').focus();return}
    if(id==='dayPick'&&e.target.value){S.day=e.target.value;S.draft={};S.noteDraft=null;S.skipFor=null;S.saved=false;render()}
    else if(id==='goalAmt'||id==='unitIn'){
      setTimeout(()=>{const f=document.activeElement&&document.activeElement.id;render();const el=f&&$(f);
        if(el){el.focus();el.select()}},0)}
    });

  // Amount / hh:mm input live preview
  document.addEventListener('input',e=>{const a=e.target.dataset&&e.target.dataset.amt;if(!a)return;
    const h=S.habits.find(x=>x.id===a.split('|')[0]);if(!h)return;
    const dk=a.split('|')[1],raw=e.target.value,v=h.type==='min'?parseHHMM(raw):(raw===''?null:Math.max(0,Number(raw)||0));
    (S.draft=S.draft||{})[a]=v;S.daySaved=null;
    const row=e.target.closest('.log'),p=v===null?null:pctOf(h,v,dk);
    row.querySelectorAll('.lv').forEach(b=>b.setAttribute('aria-pressed',v!==null&&Math.abs(shortAmt(h,SHORT[+b.dataset.lvl.split('|')[2]],dk)-v)<1e-9));
    const sim=row.querySelector('.sim');if(sim){const g=p===null?null:paint(p,true);sim.className='sim'+(g?' '+g.cls:'');if(g&&g.style)sim.setAttribute('style',g.style);else sim.removeAttribute('style')}
    row.querySelector('.lvname').textContent=p===null?'Not logged':logPct(h,v,dk);markUnsaved(row)});

  document.addEventListener('input',e=>{const a=e.target.dataset&&e.target.dataset.txt;if(!a)return;
    (S.draft=S.draft||{})[a+'#t']=e.target.value;markUnsaved(e.target.closest('.log'))});

  document.addEventListener('change',e=>{
    if(e.target.id==='dayJump'){const v=e.target.value,today=K(T());
      if(/^\d{4}-\d{2}-\d{2}$/.test(v))navigate(href.day(v>today?today:v));return}
    const sk=e.target.dataset&&e.target.dataset.aljump;
    if(sk){
      const v=e.target.value,today=K(T());
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||v>today)return;
      const diff=Math.round((new Date(today+'T00:00:00')-new Date(v+'T00:00:00'))/864e5)+1;
      S.alLimit=S.alLimit||{};
      if(diff>(S.alLimit[sk]||14))S.alLimit[sk]=diff;
      (S.alJump=S.alJump||{})[sk]=v;S.fold=S.fold||{};S.fold[`ald:${sk}:${v}`]=false;
      const y=scrollY;render();window.scrollTo(0,y);
    }
  });

  document.addEventListener('input',e=>{const r=e.target.dataset&&e.target.dataset.range;if(r)refreshRange(r.split('|')[0])});

  const root=document.documentElement;
  const isDark=()=>root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
  const paintTheme=()=>{$('theme').textContent=isDark()?'☀ Light mode':'☾ Dark mode'};
  $('theme').addEventListener('click',()=>{const t=isDark()?'light':'dark';root.dataset.theme=t;try{localStorage.setItem('theme',t)}catch(e){}paintTheme()});
  paintTheme();
  $('newFqMode').addEventListener('change',syncFq);$('newFqPer').addEventListener('change',syncFq);$('newFqN').addEventListener('input',syncFq);
  $('type').addEventListener('change',syncForm);$('stop').addEventListener('change',syncForm);$('unit').addEventListener('input',()=>syncGoalInput(false));syncForm();
  initDrag();
  document.addEventListener('change',e=>{if(e.target.classList&&e.target.classList.contains('skipReason'))e.target.closest('.skippanel').querySelector('input').hidden=e.target.value!=='Other…'});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='nameIn'){e.preventDefault();const b=document.querySelector('[data-rename]');if(b)b.click()}});

  $('login').addEventListener('submit',e=>{e.preventDefault();msg('');signIn($('email').value,$('pass').value).catch(authErr)});
  $('signup').addEventListener('click',()=>{msg('');if(!$('login').reportValidity())return;signUp($('email').value,$('pass').value).catch(authErr)});
  $('out').addEventListener('click',()=>logOut());
  $('reset').addEventListener('click',()=>{msg('');const m=$('email').value.trim();if(!m){msg('Enter your email above, then press "Forgot password?" again.');return}
    sendReset(m).then(()=>msg('If an account exists for '+m+', a reset link is on its way. Check your spam folder too.')).catch(authErr)});

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

}
