// Text DB: Natural English-readable two-way plain-text editor for a single Habit, a Category, or the entire App (#/code).
// Logs are sorted newest date first. Supports clean round-trip editing with line-by-line validation.
import {K,T,dateOf} from './util.js';
import {DK,FZ,FZE,fmtHHMM,parseHHMM,cleanHabit,cleanFreq,cleanReq,reqHistory,goalHistory,goalOn,dayNotes,noteKey,sumOf,norm,unitType} from './scoring.js';
import {cleanCats,cleanGrps,groupPath,groupTreeList,inCat,newCatId,newGrpId,renumber,renumberGrps} from './categories.js';

const oneLine=s=>String(s||'').replace(/\r?\n/g,'\\n');
const unLine=s=>String(s||'').replace(/\\n/g,'\n');
const lc=s=>String(s||'').trim().toLowerCase();
const isValidDate=k=>DK.test(k)&&K(dateOf(k))===k;

function newHabitId(used){
  let id;
  do{id='h'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}while(used.has(id));
  used.add(id);
  return id;
}

// ---- Human-readable formatters & parsers ----
function fmtType(h){
  const stop=h.stop?' (stop)':'';
  if(h.type==='min')return 'Time (hh:mm)'+stop;
  if(h.type==='bool')return 'Yes/No'+stop;
  if(h.type==='text')return 'Text (%)'+stop;
  return 'Number'+(h.unit?` (${h.unit})`:'')+stop;
}
function parseType(str){
  let s=String(str||'').trim();
  let stop=false;
  if(/\(stop\)\s*$/i.test(s)){stop=true;s=s.replace(/\(stop\)\s*$/i,'').trim()}
  const low=s.toLowerCase();
  if(low.startsWith('time')||low==='min'||low==='hh:mm')return{type:'min',unit:'min',stop};
  if(low.startsWith('yes')||low.startsWith('true')||low==='bool'||low==='boolean')return{type:'bool',unit:'',stop};
  if(low.startsWith('text'))return{type:'text',unit:'%',stop};
  if(low.startsWith('number')||low==='num'){
    const m=/\(([^)]+)\)/.exec(s);
    if(m){const u=unitType(m[1].trim());return{type:u.type,unit:u.unit,stop}}
    return{type:'num',unit:'',stop};
  }
  return null;
}

function fmtReqNatural(r){
  if(!r)return '';
  if(r.per==='none')return 'Off';
  if(r.per==='week')return `${r.x} per week`;
  if(r.per==='month')return `${r.x} per month`;
  return `${r.x} per ${r.y} days`;
}
function parseReqNatural(s){
  const t=String(s||'').trim().toLowerCase();
  if(t==='off'||t==='none')return cleanReq({per:'none'});
  let m=/^(\d+)\s*(?:per|\/)\s*(week|w)s?$/.exec(t);if(m)return cleanReq({x:+m[1],per:'week'});
  m=/^(\d+)\s*(?:per|\/)\s*(month|m)s?$/.exec(t);if(m)return cleanReq({x:+m[1],per:'month'});
  m=/^(\d+)\s*(?:per|\/)\s*(\d+)\s*(?:days?|d)?$/.exec(t);if(m)return cleanReq({x:+m[1],per:'days',y:+m[2]});
  return undefined;
}

function fmtFqNatural(f){
  if(!f)return '';
  if(f.per==='days')return `every ${f.n} days`;
  return `${f.n} per ${f.per}`;
}
function parseFqNatural(s){
  const t=String(s||'').trim().toLowerCase();
  let m=/^every\s+(\d+)\s*days?$/.exec(t);if(m)return cleanFreq({n:+m[1],per:'days'});
  m=/^(\d+)\s*(?:per|\/)\s*(week|month|days)s?$/.exec(t);if(m)return cleanFreq({n:+m[1],per:m[2]});
  return undefined;
}

function splitSummary(rest){
  // Supports " — ", " – ", " -- ", or " | "
  const m=/\s+(?:—|–|--|\|)\s+/.exec(rest);
  if(!m)return{val:rest.trim(),sum:''};
  return{val:rest.slice(0,m.index).trim(),sum:unLine(rest.slice(m.index+m[0].length).trim())};
}

// Match "Habit Name: rest" safely even when a habit's name contains ":"
function splitHabitLogLine(tr,knownNames){
  const low=tr.toLowerCase();
  for(const name of knownNames){
    if(low.startsWith(name+':')){
      return{hName:tr.slice(0,name.length).trim(),rest:tr.slice(name.length+1)};
    }
  }
  const ci=tr.indexOf(':');
  if(ci<0)return null;
  return{hName:tr.slice(0,ci).trim(),rest:tr.slice(ci+1)};
}

function fmtLogValue(h,d){
  if(h.off&&h.off[d]!==undefined){
    const r=h.off[d];
    if(r===FZ)return 'Frozen';
    if(r===FZE)return 'Frozen (end)';
    return r&&r!=='Skipped'?`Skipped (${oneLine(r)})`:'Skipped';
  }
  if(h.done&&h.done[d]>0){
    const v=h.done[d];
    if(h.type==='min')return fmtHHMM(v);
    if(h.type==='bool')return h.stop?'Slipped':'Done';
    if(h.type==='text')return `${v}%`;
    return String(v);
  }
  if(h.skip&&h.skip[d]){
    if(h.type==='bool')return h.stop?'Avoided':'Not done';
    return '0';
  }
  return '-';
}

function applyLogValue(h,d,valPart,ln,errors){
  const v=String(valPart||'').trim(),low=v.toLowerCase();
  if(!v||v==='-'||low==='(none)')return;
  if(low==='frozen'){h.off[d]=FZ;if(d<h.created)h.created=d;return}
  if(low==='frozen (end)'||low==='frozen_end'){h.off[d]=FZE;if(d<h.created)h.created=d;return}
  if(low==='skipped'||low==='skip'||low.startsWith('skipped ')||low.startsWith('skip ')){
    let reason=v.replace(/^skipped?\s*/i,'').trim();
    if(reason.startsWith('(')&&reason.endsWith(')'))reason=reason.slice(1,-1).trim();
    h.off[d]=unLine(reason||'Skipped');if(d<h.created)h.created=d;return;
  }
  if(h.type==='bool'){
    if(low==='done'||low==='yes'||low==='true'||low==='1'){h.done[d]=1;if(d<h.created)h.created=d;return}
    if(low==='not done'||low==='no'||low==='false'||low==='0'){h.skip[d]=1;if(d<h.created)h.created=d;return}
    if(low==='avoided'||low==='avoided it'){if(h.stop)h.skip[d]=1;else h.done[d]=1;if(d<h.created)h.created=d;return}
    if(low==='slipped'){if(h.stop)h.done[d]=1;else h.skip[d]=1;if(d<h.created)h.created=d;return}
  }
  const cleanV=v.endsWith('%')?v.slice(0,-1).trim():v;
  const num=h.type==='min'?parseHHMM(cleanV):Number(cleanV);
  if(num===null||!Number.isFinite(num)||num<0){
    errors.push(`Line ${ln}: Could not read value "${v}" for "${h.name}"`);return;
  }
  if(num>0)h.done[d]=num;else h.skip[d]=1;
  if(d<h.created)h.created=d;
}

function habitPropsLines(h,S,{includeCat=true}={}){
  const lines=[`Habit: ${oneLine(h.name)}`];
  if(includeCat){
    const c=S.cats.find(x=>x.id===h.cat);
    if(c)lines.push(`Category: ${c.name}`);
  }
  if(h.grp){
    const gp=groupPath(S.grps,h.grp);
    if(gp)lines.push(`Group: ${gp.replace(/ › /g,' > ')}`);
  }
  lines.push(`Type: ${fmtType(h)}`);
  if(h.type!=='bool'&&h.type!=='text'){
    const gh=goalHistory(h);
    const list=gh.length?gh:[[h.created,h.goal]];
    lines.push(`Goal: ${list.map(([d,v])=>`${h.type==='min'?fmtHHMM(v):v} (from ${d})`).join(', ')}`);
  }
  const rh=reqHistory(h);
  if(rh.length){
    lines.push(`Required: ${rh.map(([d,r])=>`${fmtReqNatural(r)} (from ${d})`).join(', ')}`);
  }
  const rqsKeys=Object.keys(h.rqs||{}).sort();
  if(rqsKeys.length){
    lines.push(`Required Skipped: ${rqsKeys.map(k=>`${k} (${oneLine(h.rqs[k])})`).join(', ')}`);
  }
  if(h.fq)lines.push(`Frequency: ${fmtFqNatural(h.fq)}`);
  lines.push(`Importance: ${h.importance||3}`);
  lines.push(`Created: ${h.created}`);
  if(h.archived)lines.push(`Archived: yes`);
  if(h.desc)lines.push(`Description: ${oneLine(h.desc)}`);
  return lines;
}

const PROP_ORDER=k=>{
  const x=lc(k);
  if(x==='habit'||x==='name')return 0;
  if(x==='type')return 1;
  if(x==='stop')return 2;
  if(x==='created')return 3;
  return 4;
};

// Apply buffered properties in dependency order (Type & Created before Goal/Required)
function applyHabitProps(h,propList,errors){
  const sorted=[...propList].sort((a,b)=>PROP_ORDER(a.key)-PROP_ORDER(b.key)||a.ln-b.ln);
  for(const {key,val,ln} of sorted){
    const k=lc(key),v=val.trim();
    if(k==='habit'||k==='name'){if(!v)errors.push(`Line ${ln}: Habit name cannot be empty`);else h.name=unLine(v)}
    else if(k==='category'||k==='cat'){h._catName=v}
    else if(k==='group'||k==='grp'){h._grpPath=v}
    else if(k==='type'){
      const t=parseType(v);
      if(!t)errors.push(`Line ${ln}: Unknown Type "${v}" (use Time (hh:mm), Number (unit), Yes/No, or Text (%))`);
      else{h.type=t.type;h.unit=t.unit;h.stop=t.stop}
    }else if(k==='stop'){h.stop=/^(yes|true|1)$/i.test(v)}
    else if(k==='goal'||k==='limit'){
      h.gl={};
      for(const item of v.split(',').map(x=>x.trim()).filter(Boolean)){
        let d=h.created||K(T()),gv=item;
        const m=/^(.+?)\s*\(\s*from\s+(\d{4}-\d{2}-\d{2})\s*\)$/i.exec(item);
        if(m){gv=m[1].trim();d=m[2]}
        else if(item.includes('=')){const p=item.split('=');d=p[0].trim();gv=p[1].trim()}
        const num=h.type==='min'?parseHHMM(gv):Number(gv);
        if(!isValidDate(d)||!(num>0))errors.push(`Line ${ln}: Invalid Goal "${item}" (example: 01:30 (from 2026-09-01))`);
        else h.gl[d]=num;
      }
      if(Object.keys(h.gl).length)h.goal=goalOn(h,K(T()));
    }else if(k==='required'||k==='req'){
      h.rq={};
      for(const item of v.split(',').map(x=>x.trim()).filter(Boolean)){
        let d=h.created||K(T()),rv=item;
        const m=/^(.+?)\s*\(\s*from\s+(\d{4}-\d{2}-\d{2})\s*\)$/i.exec(item);
        if(m){rv=m[1].trim();d=m[2]}
        else if(item.includes('=')){const p=item.split('=');d=p[0].trim();rv=p[1].trim()}
        const r=parseReqNatural(rv);
        if(!isValidDate(d)||!r)errors.push(`Line ${ln}: Invalid Required "${item}" (example: 5 per week (from 2026-09-01))`);
        else h.rq[d]=r;
      }
    }else if(k==='required skipped'||k==='req_skip'){
      h.rqs={};
      for(const item of v.split(',').map(x=>x.trim()).filter(Boolean)){
        const m=/^([^\s(]+)\s*(?:\(([^)]*)\))?$/.exec(item);
        if(!m)errors.push(`Line ${ln}: Invalid Required Skipped "${item}"`);
        else h.rqs[m[1].trim()]=unLine((m[2]||'Skipped').trim());
      }
    }else if(k==='frequency'||k==='periodic'||k==='fq'){
      if(!v||lc(v)==='every day'||lc(v)==='daily'){delete h.fq}
      else{const f=parseFqNatural(v);if(!f)errors.push(`Line ${ln}: Invalid Frequency "${v}" (example: 3 per week)`);else h.fq=f}
    }else if(k==='importance'||k==='imp'){
      const n=Math.round(Number(v));
      if(n>=1&&n<=5)h.importance=n;else errors.push(`Line ${ln}: Importance must be 1 to 5`);
    }else if(k==='created'){
      if(!isValidDate(v))errors.push(`Line ${ln}: Created must be a valid YYYY-MM-DD date`);else h.created=v;
    }else if(k==='archived'){
      h.archived=/^(yes|true|1)$/i.test(v);
    }else if(k==='description'||k==='desc'){
      h.desc=unLine(v);
    }else{
      errors.push(`Line ${ln}: Unknown property "${key}"`);
    }
  }
}

function collectDates(habits){
  const set=new Set();
  for(const h of habits){
    for(const k in h.done||{})if(DK.test(k))set.add(k);
    for(const k in h.skip||{})if(DK.test(k))set.add(k);
    for(const k in h.off||{})if(DK.test(k))set.add(k);
    for(const k in h.sum||{})if(DK.test(k))set.add(k);
    for(const key in h.nts||{})if(DK.test(key.slice(0,10)))set.add(key.slice(0,10));
  }
  return [...set].sort().reverse();
}

function ensureGroupPath(pathStr,catId,grps){
  const parts=String(pathStr||'').split(/\s*(?:>|›|\/)\s*/).map(x=>x.trim()).filter(Boolean);
  let parent=undefined;
  for(const name of parts){
    let found=grps.find(g=>g.cat===catId&&(g.parent||undefined)===parent&&lc(g.name)===lc(name));
    if(!found){
      found={id:newGrpId(),cat:catId,name:name.slice(0,40),order:grps.filter(g=>g.cat===catId&&(g.parent||undefined)===parent).length,...(parent?{parent}:{})};
      grps.push(found);
    }
    parent=found.id;
  }
  return parent;
}

// ============================================================================
// 1. SINGLE HABIT TEXT (for Habit page)
// ============================================================================
export function exportHabitText(h,S){
  const lines=habitPropsLines(h,S,{includeCat:true});
  lines.push('','Logs:');
  const dates=collectDates([h]);
  if(!dates.length){
    const ex=h.type==='min'?'01:00':h.type==='bool'?'Done':'1';
    lines.push(`# ${K(T())}: ${ex} — What you did`,`#   - Optional note`);
  }else{
    for(const d of dates){
      const val=fmtLogValue(h,d),sm=sumOf(h,d),ns=dayNotes(h,d).filter(n=>n.t.trim());
      lines.push(`${d}: ${val}${sm?' — '+oneLine(sm):''}`);
      for(const n of ns)lines.push(`  - ${oneLine(n.t)}`);
    }
  }
  return lines.join('\n')+'\n';
}

export function parseHabitText(text,origH,S){
  const rawLines=String(text||'').split(/\r?\n/),errors=[];
  const h={id:origH.id,name:origH.name,cat:origH.cat,type:origH.type,stop:origH.stop,goal:origH.goal,unit:origH.unit,importance:origH.importance||3,created:origH.created,ord:origH.ord,done:{},skip:{},off:{},notes:{},sum:{},nts:{},gl:{},rq:{},rqs:{}};
  const props=[],logEntries=[];
  let inLogs=false,curDate=null,curEntry=null;

  for(let i=0;i<rawLines.length;i++){
    const ln=i+1,raw=rawLines[i],tr=raw.trim();
    if(!tr||tr.startsWith('#'))continue;
    if(lc(tr)==='logs:'){inLogs=true;curDate=null;curEntry=null;continue}
    if(!inLogs){
      const ci=tr.indexOf(':');
      if(ci<0){errors.push(`Line ${ln}: Expected "Property: value"`);continue}
      props.push({key:tr.slice(0,ci),val:tr.slice(ci+1),ln});
    }else{
      if(tr.startsWith('- ')&&curEntry){
        curEntry.notes.push(unLine(tr.slice(2)));
      }else{
        const m=/^(\d{4}-\d{2}-\d{2})\s*:\s*(.*)$/.exec(tr);
        if(!m){errors.push(`Line ${ln}: Expected "YYYY-MM-DD: value"`);continue}
        if(!isValidDate(m[1])){errors.push(`Line ${ln}: Invalid calendar date "${m[1]}"`);continue}
        curDate=m[1];
        const {val,sum}=splitSummary(m[2]);
        curEntry={ln,date:curDate,val,sum,notes:[]};
        logEntries.push(curEntry);
      }
    }
  }

  applyHabitProps(h,props,errors);

  let noteIdx=0;
  for(const e of logEntries){
    applyLogValue(h,e.date,e.val,e.ln,errors);
    if(e.sum)h.sum[e.date]=e.sum;
    for(const nt of e.notes)if(nt.trim())h.nts[noteKey(e.date,'t'+(++noteIdx))]={t:nt,at:noteIdx};
  }

  const grps=S.grps.map(g=>({...g}));
  if(h._catName!==undefined){
    const foundC=S.cats.find(c=>lc(c.name)===lc(h._catName));
    if(!foundC)errors.push(`Unknown Category "${h._catName}"`);
    else h.cat=foundC.id;
  }
  if(h._grpPath)h.grp=ensureGroupPath(h._grpPath,h.cat,grps);
  delete h._catName;delete h._grpPath;
  if(errors.length)return{ok:false,errors};
  const cleaned=cleanHabit(h);norm(cleaned);
  return{ok:true,habit:cleaned,grps:renumberGrps(grps)};
}

// ============================================================================
// 2. CATEGORY TEXT (for Category page)
// ============================================================================
export function exportCategoryText(c,S){
  const lines=[`Category: ${c.name} (${c.color}${c.icon?', '+c.icon:''})`];
  const tree=groupTreeList(S.grps,c.id);
  if(tree.length){
    lines.push(`Groups: ${tree.map(({g})=>groupPath(S.grps,g.id).replace(/ › /g,' > ')).join(', ')}`);
  }
  const hs=inCat(S.habits,c.id);
  lines.push('','Logs:');
  const dates=collectDates(hs);
  if(!dates.length){
    lines.push(`# ${K(T())}`,'#   Habit Name: 01:00 — What you did','#     - Optional note');
  }else{
    for(const d of dates){
      const dl=[];
      for(const h of hs){
        const hasAny=(h.done&&h.done[d]>0)||(h.skip&&h.skip[d])||(h.off&&h.off[d]!==undefined)||sumOf(h,d)||dayNotes(h,d).some(n=>n.t.trim());
        if(!hasAny)continue;
        const val=fmtLogValue(h,d),sm=sumOf(h,d),ns=dayNotes(h,d).filter(n=>n.t.trim());
        dl.push(`  ${h.name}: ${val}${sm?' — '+oneLine(sm):''}`);
        for(const n of ns)dl.push(`    - ${oneLine(n.t)}`);
      }
      if(dl.length)lines.push(d,...dl);
    }
  }
  lines.push('','Habits:');
  for(const h of hs){
    lines.push(...habitPropsLines(h,S,{includeCat:false}),'');
  }
  return lines.join('\n').trimEnd()+'\n';
}

export function parseCategoryText(text,origC,S){
  const rawLines=String(text||'').split(/\r?\n/),errors=[];
  const cat={...origC};
  const otherGrps=S.grps.filter(g=>g.cat!==origC.id).map(g=>({...g}));
  const existingCatGrps=S.grps.filter(g=>g.cat===origC.id);
  const newCatGrps=[];
  const ensureCatGrp=pathStr=>{
    const parts=String(pathStr||'').split(/\s*(?:>|›|\/)\s*/).map(x=>x.trim()).filter(Boolean);
    let parent=undefined;
    for(const name of parts){
      let found=newCatGrps.find(g=>(g.parent||undefined)===parent&&lc(g.name)===lc(name));
      if(!found){
        const old=existingCatGrps.find(g=>(g.parent||undefined)===parent&&lc(g.name)===lc(name));
        found={id:old?old.id:newGrpId(),cat:origC.id,name:name.slice(0,40),order:newCatGrps.filter(g=>(g.parent||undefined)===parent).length,...(parent?{parent}:{})};
        newCatGrps.push(found);
      }
      parent=found.id;
    }
    return parent;
  };

  let section='header',curDate=null,curLog=null,curBlock=null;
  const rawLogs=[],habitBlocks=[];

  for(let i=0;i<rawLines.length;i++){
    const ln=i+1,raw=rawLines[i],tr=raw.trim();
    if(!tr||tr.startsWith('#'))continue;
    if(lc(tr)==='logs:'){section='logs';curDate=null;curLog=null;continue}
    if(lc(tr)==='habits:'){section='habits';curBlock=null;continue}

    if(section==='header'){
      const ci=tr.indexOf(':');
      if(ci<0){errors.push(`Line ${ln}: Expected "Category:" or "Groups:"`);continue}
      const k=lc(tr.slice(0,ci)),v=tr.slice(ci+1).trim();
      if(k==='category'){
        const m=/^(.+?)\s*(?:\(([^)]*)\))?$/.exec(v);
        if(!m||!m[1].trim())errors.push(`Line ${ln}: Invalid Category header`);
        else{
          cat.name=m[1].trim().slice(0,40);
          if(m[2]){
            const parts=m[2].split(',').map(x=>x.trim());
            if(/^#[0-9a-f]{6}$/i.test(parts[0]||''))cat.color=parts[0];
            if(parts[1]!==undefined)cat.icon=parts[1].slice(0,8);
          }
        }
      }else if(k==='groups'){
        for(const p of v.split(',').map(x=>x.trim()).filter(Boolean))ensureCatGrp(p);
      }
    }else if(section==='logs'){
      const maybeDate=tr.replace(/:$/,'');
      if(DK.test(maybeDate)){
        if(!isValidDate(maybeDate)){errors.push(`Line ${ln}: Invalid calendar date "${maybeDate}"`);curDate=null;continue}
        curDate=maybeDate;curLog=null;continue;
      }
      if(!curDate){errors.push(`Line ${ln}: Log entry needs a date (YYYY-MM-DD) above it`);continue}
      if(tr.startsWith('- ')&&curLog){curLog.notes.push(unLine(tr.slice(2)))}
      else{curLog={ln,date:curDate,raw:tr,notes:[]};rawLogs.push(curLog)}
    }else if(section==='habits'){
      const ci=tr.indexOf(':');
      if(ci<0){errors.push(`Line ${ln}: Expected "Property: value"`);continue}
      const key=tr.slice(0,ci).trim(),val=tr.slice(ci+1).trim();
      if(lc(key)==='habit'){
        curBlock={name:unLine(val),props:[{key,val,ln}]};
        habitBlocks.push(curBlock);
      }else if(curBlock){
        curBlock.props.push({key,val,ln});
      }else errors.push(`Line ${ln}: Start each habit block with "Habit: Name"`);
    }
  }

  const usedIds=new Set(S.habits.filter(h=>h.cat!==origC.id||h.archived).map(h=>h.id));
  const existingPool=inCat(S.habits,origC.id).slice();
  const parsedHabits=[];
  for(let idx=0;idx<habitBlocks.length;idx++){
    const blk=habitBlocks[idx];
    const pi=existingPool.findIndex(x=>lc(x.name)===lc(blk.name)&&!usedIds.has(x.id));
    const prev=pi>=0?existingPool.splice(pi,1)[0]:null;
    const id=prev?prev.id:newHabitId(usedIds);
    usedIds.add(id);
    const h={id,name:blk.name,cat:origC.id,type:'min',stop:false,goal:30,unit:'min',importance:3,created:K(T()),ord:prev?prev.ord:idx,done:{},skip:{},off:{},notes:{},sum:{},nts:{},gl:{},rq:{},rqs:{}};
    applyHabitProps(h,blk.props,errors);
    if(h._grpPath)h.grp=ensureCatGrp(h._grpPath);
    delete h._grpPath;delete h._catName;
    parsedHabits.push(h);
  }

  const byName=new Map(parsedHabits.map(h=>[lc(h.name),h]));
  const knownNames=[...byName.keys()].sort((a,b)=>b.length-a.length);
  let noteIdx=0;
  for(const e of rawLogs){
    const sp=splitHabitLogLine(e.raw,knownNames);
    if(!sp){errors.push(`Line ${e.ln}: Expected "Habit Name: value"`);continue}
    const h=byName.get(lc(sp.hName));
    if(!h){errors.push(`Line ${e.ln}: Unknown habit "${sp.hName}" in this category`);continue}
    const {val,sum}=splitSummary(sp.rest);
    applyLogValue(h,e.date,val,e.ln,errors);
    if(sum)h.sum[e.date]=sum;
    for(const nt of e.notes)if(nt.trim())h.nts[noteKey(e.date,'t'+(++noteIdx))]={t:nt,at:noteIdx};
  }

  if(errors.length)return{ok:false,errors};
  const cleaned=parsedHabits.map(cleanHabit).filter(Boolean);
  cleaned.forEach(norm);
  const parsedIds=new Set(cleaned.map(h=>h.id));
  const keepArchived=S.habits.filter(h=>h.cat===origC.id&&h.archived&&!parsedIds.has(h.id));
  const otherHabits=S.habits.filter(h=>h.cat!==origC.id);
  return{ok:true,cat,grps:renumberGrps([...otherGrps,...newCatGrps]),habits:[...otherHabits,...keepArchived,...cleaned]};
}

// ============================================================================
// 3. FULL APP TEXT DB (for #/code)
// ============================================================================
export function exportCodeDB(S){
  const lines=['Logs:'];
  const nameCounts={};
  for(const h of S.habits)nameCounts[lc(h.name)]=(nameCounts[lc(h.name)]||0)+1;
  const logLabel=h=>{
    if((nameCounts[lc(h.name)]||0)<=1)return h.name;
    const c=S.cats.find(x=>x.id===h.cat);
    return c?`${c.name} / ${h.name}`:h.name;
  };

  const dates=collectDates(S.habits);
  if(!dates.length){
    lines.push(`# ${K(T())}`,'#   Habit Name: 01:00 — What you did','#     - Optional note');
  }else{
    for(const d of dates){
      const dl=[];
      for(const h of S.habits){
        const hasAny=(h.done&&h.done[d]>0)||(h.skip&&h.skip[d])||(h.off&&h.off[d]!==undefined)||sumOf(h,d)||dayNotes(h,d).some(n=>n.t.trim());
        if(!hasAny)continue;
        const val=fmtLogValue(h,d),sm=sumOf(h,d),ns=dayNotes(h,d).filter(n=>n.t.trim());
        dl.push(`  ${logLabel(h)}: ${val}${sm?' — '+oneLine(sm):''}`);
        for(const n of ns)dl.push(`    - ${oneLine(n.t)}`);
      }
      if(dl.length)lines.push(d,...dl);
    }
  }

  lines.push('','Categories:');
  for(const c of S.cats){
    lines.push(`${c.name} (${c.color}${c.icon?', '+c.icon:''})`);
    const tree=groupTreeList(S.grps,c.id);
    if(tree.length){
      lines.push(`  Groups: ${tree.map(({g})=>groupPath(S.grps,g.id).replace(/ › /g,' > ')).join(', ')}`);
    }
  }

  lines.push('','Habits:');
  for(const h of S.habits){
    lines.push(...habitPropsLines(h,S,{includeCat:true}),'');
  }
  return lines.join('\n').trimEnd()+'\n';
}

export function parseCodeDB(text,S){
  const rawLines=String(text||'').split(/\r?\n/),errors=[];
  let section=null,curDate=null,curLog=null,curCat=null,curBlock=null;
  const rawLogs=[],catsRaw=[],grpsRaw=[],habitBlocks=[];

  const existingCatByName=new Map(S.cats.map(c=>[lc(c.name),c]));
  const usedCatIds=new Set();

  const ensureGrp=(catId,pathStr)=>{
    const parts=String(pathStr||'').split(/\s*(?:>|›|\/)\s*/).map(x=>x.trim()).filter(Boolean);
    let parent=undefined;
    for(const name of parts){
      let found=grpsRaw.find(g=>g.cat===catId&&(g.parent||undefined)===parent&&lc(g.name)===lc(name));
      if(!found){
        const old=S.grps.find(g=>g.cat===catId&&(g.parent||undefined)===parent&&lc(g.name)===lc(name));
        found={id:old?old.id:newGrpId(),cat:catId,name:name.slice(0,40),order:grpsRaw.filter(g=>g.cat===catId&&(g.parent||undefined)===parent).length,...(parent?{parent}:{})};
        grpsRaw.push(found);
      }
      parent=found.id;
    }
    return parent;
  };

  for(let i=0;i<rawLines.length;i++){
    const ln=i+1,raw=rawLines[i],tr=raw.trim();
    if(!tr||tr.startsWith('#'))continue;
    if(lc(tr)==='logs:'){section='logs';curDate=null;curLog=null;continue}
    if(lc(tr)==='categories:'){section='categories';curCat=null;continue}
    if(lc(tr)==='habits:'){section='habits';curBlock=null;continue}

    if(section==='logs'){
      const maybeDate=tr.replace(/:$/,'');
      if(DK.test(maybeDate)){
        if(!isValidDate(maybeDate)){errors.push(`Line ${ln}: Invalid calendar date "${maybeDate}"`);curDate=null;continue}
        curDate=maybeDate;curLog=null;continue;
      }
      if(!curDate){errors.push(`Line ${ln}: Log entry needs a date (YYYY-MM-DD) above it`);continue}
      if(tr.startsWith('- ')&&curLog){curLog.notes.push(unLine(tr.slice(2)))}
      else{curLog={ln,date:curDate,raw:tr,notes:[]};rawLogs.push(curLog)}
    }else if(section==='categories'){
      if(/^groups\s*:/i.test(tr)){
        if(!curCat){errors.push(`Line ${ln}: "Groups:" must appear under a category`);continue}
        const v=tr.slice(tr.indexOf(':')+1).trim();
        for(const p of v.split(',').map(x=>x.trim()).filter(Boolean))ensureGrp(curCat.id,p);
      }else{
        const m=/^(.+?)\s*(?:\(([^)]*)\))?$/.exec(tr);
        if(!m||!m[1].trim()){errors.push(`Line ${ln}: Invalid category "${tr}"`);continue}
        const name=m[1].trim().slice(0,40);
        const old=existingCatByName.get(lc(name));
        let id=old&&!usedCatIds.has(old.id)?old.id:newCatId();
        while(usedCatIds.has(id))id=newCatId();
        usedCatIds.add(id);
        let color=old?old.color:'#5B6B82',icon=old?old.icon:'';
        if(m[2]){
          const parts=m[2].split(',').map(x=>x.trim());
          if(/^#[0-9a-f]{6}$/i.test(parts[0]||''))color=parts[0];
          if(parts[1]!==undefined)icon=parts[1].slice(0,8);
        }
        curCat={id,name,color,icon,order:catsRaw.length};
        catsRaw.push(curCat);
      }
    }else if(section==='habits'){
      const ci=tr.indexOf(':');
      if(ci<0){errors.push(`Line ${ln}: Expected "Property: value"`);continue}
      const key=tr.slice(0,ci).trim(),val=tr.slice(ci+1).trim();
      if(lc(key)==='habit'){
        curBlock={name:unLine(val),props:[{key,val,ln}]};
        habitBlocks.push(curBlock);
      }else if(curBlock){
        curBlock.props.push({key,val,ln});
      }else errors.push(`Line ${ln}: Start each habit block with "Habit: Name"`);
    }else{
      errors.push(`Line ${ln}: Unexpected line outside Logs:, Categories:, or Habits:`);
    }
  }

  const cats=cleanCats(catsRaw);
  if(!cats.length)errors.push('Categories: must contain at least one category.');
  const catByName=new Map(cats.map(c=>[lc(c.name),c]));

  // Match existing habits cleanly without duplicate ID collisions
  const usedHabitIds=new Set();
  const existingPool=S.habits.map(h=>{const c=S.cats.find(x=>x.id===h.cat);return{h,catName:c?lc(c.name):''}});
  const parsedHabits=[];

  for(let idx=0;idx<habitBlocks.length;idx++){
    const blk=habitBlocks[idx];
    const h={id:'',name:blk.name,cat:cats[0]?cats[0].id:'',type:'min',stop:false,goal:30,unit:'min',importance:3,created:K(T()),ord:idx,done:{},skip:{},off:{},notes:{},sum:{},nts:{},gl:{},rq:{},rqs:{}};
    applyHabitProps(h,blk.props,errors);
    if(h._catName){
      const c=catByName.get(lc(h._catName));
      if(!c)errors.push(`Habit "${h.name}": Unknown Category "${h._catName}"`);
      else h.cat=c.id;
    }
    const cObj=cats.find(x=>x.id===h.cat);
    const cKey=cObj?lc(cObj.name):'';
    let pi=existingPool.findIndex(x=>lc(x.h.name)===lc(h.name)&&x.catName===cKey&&!usedHabitIds.has(x.h.id));
    if(pi<0)pi=existingPool.findIndex(x=>lc(x.h.name)===lc(h.name)&&!usedHabitIds.has(x.h.id));
    const prev=pi>=0?existingPool.splice(pi,1)[0].h:null;
    h.id=prev?prev.id:newHabitId(usedHabitIds);
    usedHabitIds.add(h.id);
    if(prev&&Number.isFinite(prev.ord))h.ord=prev.ord;
    if(h._grpPath&&h.cat)h.grp=ensureGrp(h.cat,h._grpPath);
    delete h._catName;delete h._grpPath;
    parsedHabits.push(h);
  }

  const byFull=new Map(),byShort=new Map();
  for(const h of parsedHabits){
    const c=cats.find(x=>x.id===h.cat);
    if(c)byFull.set(lc(c.name)+' / '+lc(h.name),h);
    byShort.set(lc(h.name),h);
  }
  const knownNames=[...new Set([...byFull.keys(),...byShort.keys()])].sort((a,b)=>b.length-a.length);
  let noteIdx=0;
  for(const e of rawLogs){
    const sp=splitHabitLogLine(e.raw,knownNames);
    if(!sp){errors.push(`Line ${e.ln}: Expected "Habit Name: value"`);continue}
    const key=lc(sp.hName).replace(/\s*\/\s*/,' / ');
    const h=byFull.get(key)||byShort.get(lc(sp.hName));
    if(!h){errors.push(`Line ${e.ln}: Unknown habit "${sp.hName}"`);continue}
    const {val,sum}=splitSummary(sp.rest);
    applyLogValue(h,e.date,val,e.ln,errors);
    if(sum)h.sum[e.date]=sum;
    for(const nt of e.notes)if(nt.trim())h.nts[noteKey(e.date,'t'+(++noteIdx))]={t:nt,at:noteIdx};
  }

  if(errors.length)return{ok:false,errors};
  const grps=cleanGrps(grpsRaw,cats);
  const habits=parsedHabits.map(cleanHabit).filter(Boolean);
  habits.forEach(norm);
  return{ok:true,cats:renumber(cats),grps:renumberGrps(grps),habits};
}
