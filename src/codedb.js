// Code DB (#/code): Minimal YAML-like two-way plain-text database for the entire app.
// Logs are at the top (sorted newest date first) so today is line 1. Config (categories, groups, habits) is at the bottom.
import {K,T} from './util.js';
import {DK,FZ,FZE,fmtHHMM,parseHHMM,cleanHabit,cleanFreq,cleanReq,reqText,reqHistory,goalHistory,dayNotes,noteKey,sumOf,norm} from './scoring.js';
import {cleanCats,cleanGrps} from './categories.js';

const oneLine=s=>String(s||'').replace(/\r?\n/g,'\\n');
const unLine=s=>String(s||'').replace(/\\n/g,'\n');

function fmtReqVal(r){
  if(!r)return '';
  return r.per==='days'?`${r.x}/${r.y}d`:`${r.x}/${r.per}`;
}
function parseReqVal(s){
  const t=String(s||'').trim().toLowerCase();
  let m=/^(\d+)\s*\/\s*(week|w)$/.exec(t);if(m)return cleanReq({x:+m[1],per:'week'});
  m=/^(\d+)\s*\/\s*(month|m)$/.exec(t);if(m)return cleanReq({x:+m[1],per:'month'});
  m=/^(\d+)\s*\/\s*(\d+)\s*d?$/.exec(t);if(m)return cleanReq({x:+m[1],per:'days',y:+m[2]});
  return undefined;
}
function fmtFqVal(f){return f?`${f.n}/${f.per}`:''}
function parseFqVal(s){
  const m=/^(\d+)\s*\/\s*(week|month|days)$/.exec(String(s||'').trim().toLowerCase());
  return m?cleanFreq({n:+m[1],per:m[2]}):undefined;
}

export function exportCodeDB(S){
  const lines=[];
  // Collect all dates that have any log, skip, off, summary, or note
  const dateSet=new Set();
  for(const h of S.habits){
    for(const k in h.done||{})if(DK.test(k))dateSet.add(k);
    for(const k in h.skip||{})if(DK.test(k))dateSet.add(k);
    for(const k in h.off||{})if(DK.test(k))dateSet.add(k);
    for(const k in h.sum||{})if(DK.test(k))dateSet.add(k);
    for(const key in h.nts||{})if(DK.test(key.slice(0,10)))dateSet.add(key.slice(0,10));
  }
  const dates=[...dateSet].sort().reverse();
  const today=K(T());
  if(!dates.includes(today))lines.push(`# ${today}:`,'#   habit_id: 01:00 | What you did','#     - Optional note','');

  for(const d of dates){
    const dayLines=[];
    for(const h of S.habits){
      const hasDone=h.done&&h.done[d]>0;
      const hasSkip=h.skip&&h.skip[d];
      const hasOff=h.off&&h.off[d]!==undefined;
      const sm=sumOf(h,d);
      const ns=dayNotes(h,d).filter(n=>n.t.trim());
      if(!hasDone&&!hasSkip&&!hasOff&&!sm&&!ns.length)continue;

      let val='';
      if(hasOff){
        const r=h.off[d];
        val=r===FZ?'frozen':r===FZE?'frozen_end':'skip '+oneLine(r);
      }else if(hasDone){
        const v=h.done[d];
        val=h.type==='min'?fmtHHMM(v):h.type==='bool'?'done':String(v);
      }else if(hasSkip){
        val='0';
      }else{
        val='-';
      }
      dayLines.push(`  ${h.id}: ${val}${sm?' | '+oneLine(sm):''}`);
      for(const n of ns)dayLines.push(`    - ${oneLine(n.t)}`);
    }
    if(dayLines.length){lines.push(`${d}:`,...dayLines,'')}
  }

  lines.push('# --- Config (categories, groups, habits) ---');
  lines.push('categories:');
  for(const c of S.cats){
    lines.push(`  ${c.id}: ${c.name} | ${c.color}${c.icon?' | '+c.icon:''}`);
  }
  if(S.grps.length){
    lines.push('','groups:');
    for(const g of S.grps){
      lines.push(`  ${g.id}: ${g.name} | cat=${g.cat}${g.parent?' | parent='+g.parent:''}`);
    }
  }
  lines.push('','habits:');
  for(const h of S.habits){
    lines.push(`  ${h.id}:`);
    lines.push(`    name: ${oneLine(h.name)}`);
    if(h.cat)lines.push(`    cat: ${h.cat}`);
    if(h.grp)lines.push(`    grp: ${h.grp}`);
    lines.push(`    type: ${h.type}`);
    if(h.stop)lines.push(`    stop: true`);
    if(h.unit)lines.push(`    unit: ${h.unit}`);
    lines.push(`    imp: ${h.importance||3}`);
    lines.push(`    created: ${h.created}`);
    if(h.archived)lines.push(`    archived: true`);
    if(h.desc)lines.push(`    desc: ${oneLine(h.desc)}`);
    if(h.fq)lines.push(`    fq: ${fmtFqVal(h.fq)}`);
    const gh=goalHistory(h);
    if(gh.length){
      lines.push(`    goal: ${gh.map(([d,v])=>`${d}=${h.type==='min'?fmtHHMM(v):v}`).join(', ')}`);
    }else if(h.type!=='bool'&&h.type!=='text'){
      lines.push(`    goal: ${h.created}=${h.type==='min'?fmtHHMM(h.goal):h.goal}`);
    }
    const rh=reqHistory(h);
    if(rh.length){
      lines.push(`    req: ${rh.map(([d,r])=>`${d}=${fmtReqVal(r)}`).join(', ')}`);
    }
    const rqsKeys=Object.keys(h.rqs||{}).sort();
    if(rqsKeys.length){
      lines.push(`    req_skip: ${rqsKeys.map(k=>`${k}=${oneLine(h.rqs[k])}`).join(', ')}`);
    }
  }
  return lines.join('\n')+'\n';
}

export function parseCodeDB(text,S){
  const rawLines=String(text||'').split(/\r?\n/);
  const errors=[];
  const catsRaw=[],grpsRaw=[],habitsMap=new Map(),logs=[];
  let section=null,curDate=null,curHabitId=null,curLogEntry=null;

  for(let idx=0;idx<rawLines.length;idx++){
    const ln=idx+1,raw=rawLines[idx];
    if(!raw.trim()||raw.trim().startsWith('#'))continue;
    const indent=raw.match(/^ */)[0].length;
    const trimmed=raw.trim();

    // Top-level header (indent 0)
    if(indent===0){
      curLogEntry=null;curHabitId=null;curDate=null;
      if(trimmed==='categories:'){section='categories';continue}
      if(trimmed==='groups:'){section='groups';continue}
      if(trimmed==='habits:'){section='habits';continue}
      if(trimmed.endsWith(':')&&DK.test(trimmed.slice(0,-1))){
        section='day';curDate=trimmed.slice(0,-1);continue;
      }
      errors.push(`Line ${ln}: Unknown top-level section "${trimmed}"`);
      continue;
    }

    if(section==='categories'){
      const m=/^([\w-]{1,40})\s*:\s*(.+)$/.exec(trimmed);
      if(!m){errors.push(`Line ${ln}: Invalid category entry`);continue}
      const parts=m[2].split('|').map(x=>x.trim());
      catsRaw.push({id:m[1],name:parts[0],color:parts[1]||'#5B6B82',icon:parts[2]||'',order:catsRaw.length});
    }else if(section==='groups'){
      const m=/^([\w-]{1,40})\s*:\s*(.+)$/.exec(trimmed);
      if(!m){errors.push(`Line ${ln}: Invalid group entry`);continue}
      const parts=m[2].split('|').map(x=>x.trim());
      const g={id:m[1],name:parts[0],cat:'',order:grpsRaw.length};
      for(const p of parts.slice(1)){
        if(p.startsWith('cat='))g.cat=p.slice(4).trim();
        else if(p.startsWith('parent='))g.parent=p.slice(7).trim();
      }
      if(!g.cat){errors.push(`Line ${ln}: Group "${g.id}" is missing cat=<id>`);continue}
      grpsRaw.push(g);
    }else if(section==='habits'){
      if(indent===2&&trimmed.endsWith(':')){
        curHabitId=trimmed.slice(0,-1).trim();
        if(!/^[\w-]{1,40}$/.test(curHabitId)){errors.push(`Line ${ln}: Invalid habit id "${curHabitId}"`);curHabitId=null;continue}
        const prev=S.habits.find(x=>x.id===curHabitId);
        habitsMap.set(curHabitId,{id:curHabitId,name:curHabitId,type:'min',stop:false,goal:30,unit:'min',importance:3,created:K(T()),ord:prev?prev.ord:habitsMap.size,done:{},skip:{},off:{},notes:{},sum:{},nts:{},gl:{},rq:{},rqs:{}});
      }else if(indent>=4&&curHabitId){
        const ci=trimmed.indexOf(':');
        if(ci<0){errors.push(`Line ${ln}: Expected "key: value" inside habit "${curHabitId}"`);continue}
        const k=trimmed.slice(0,ci).trim(),v=trimmed.slice(ci+1).trim(),h=habitsMap.get(curHabitId);
        if(k==='name')h.name=unLine(v);
        else if(k==='cat')h.cat=v;
        else if(k==='grp')h.grp=v;
        else if(k==='type')h.type=v;
        else if(k==='stop')h.stop=v==='true';
        else if(k==='unit')h.unit=v;
        else if(k==='imp')h.importance=Number(v)||3;
        else if(k==='created'){if(!DK.test(v))errors.push(`Line ${ln}: Invalid date "${v}"`);else h.created=v}
        else if(k==='archived')h.archived=v==='true';
        else if(k==='desc')h.desc=unLine(v);
        else if(k==='fq'){const f=parseFqVal(v);if(!f)errors.push(`Line ${ln}: Invalid fq "${v}"`);else h.fq=f}
        else if(k==='goal'){
          for(const item of v.split(',').map(x=>x.trim()).filter(Boolean)){
            const [d,gv]=item.split('=').map(x=>x.trim());
            const num=h.type==='min'?parseHHMM(gv):Number(gv);
            if(!DK.test(d)||!(num>0))errors.push(`Line ${ln}: Invalid goal entry "${item}"`);
            else{h.gl[d]=num;h.goal=num}
          }
        }else if(k==='req'){
          for(const item of v.split(',').map(x=>x.trim()).filter(Boolean)){
            const [d,rv]=item.split('=').map(x=>x.trim());
            const r=parseReqVal(rv);
            if(!DK.test(d)||!r)errors.push(`Line ${ln}: Invalid req entry "${item}" (use e.g. 5/week, 20/month, 3/5d)`);
            else h.rq[d]=r;
          }
        }else if(k==='req_skip'){
          for(const item of v.split(',').map(x=>x.trim()).filter(Boolean)){
            const eq=item.indexOf('=');
            if(eq<0)errors.push(`Line ${ln}: Invalid req_skip entry "${item}"`);
            else h.rqs[item.slice(0,eq).trim()]=unLine(item.slice(eq+1).trim());
          }
        }else errors.push(`Line ${ln}: Unknown habit property "${k}"`);
      }else errors.push(`Line ${ln}: Unexpected indentation in habits`);
    }else if(section==='day'&&curDate){
      if(trimmed.startsWith('- ')&&curLogEntry){
        curLogEntry.notes.push(unLine(trimmed.slice(2)));
      }else{
        const ci=trimmed.indexOf(':');
        if(ci<0){errors.push(`Line ${ln}: Expected "habit_id: value"`);continue}
        const hid=trimmed.slice(0,ci).trim(),rest=trimmed.slice(ci+1).trim();
        const pi=rest.indexOf('|');
        const valPart=(pi>=0?rest.slice(0,pi):rest).trim();
        const sumPart=pi>=0?unLine(rest.slice(pi+1).trim()):'';
        curLogEntry={ln,date:curDate,hid,valPart,sumPart,notes:[]};
        logs.push(curLogEntry);
      }
    }else{
      errors.push(`Line ${ln}: Unexpected line outside any section`);
    }
  }

  const cats=cleanCats(catsRaw);
  if(!cats.length)errors.push('Config must contain at least one valid category.');
  const grps=cleanGrps(grpsRaw,cats);

  // Apply parsed logs to habits
  let noteIdx=0;
  for(const entry of logs){
    const h=habitsMap.get(entry.hid);
    if(!h){errors.push(`Line ${entry.ln}: Unknown habit id "${entry.hid}"`);continue}
    const {date:d,valPart:v,sumPart:sm,notes}=entry;
    if(v==='frozen')h.off[d]=FZ;
    else if(v==='frozen_end')h.off[d]=FZE;
    else if(v.toLowerCase().startsWith('skip'))h.off[d]=unLine(v.slice(4).trim()||'Skipped');
    else if(v==='-'||v===''){/* summary/notes only */}
    else if(v==='0'||v==='false'||v==='no'){h.skip[d]=1}
    else if(v==='done'||v==='true'||v==='yes'){h.done[d]=1}
    else{
      const num=h.type==='min'?parseHHMM(v):Number(v);
      if(num===null||!Number.isFinite(num)||num<0){errors.push(`Line ${entry.ln}: Invalid value "${v}" for "${entry.hid}"`);continue}
      if(num>0)h.done[d]=num;else h.skip[d]=1;
    }
    if(sm)h.sum[d]=sm;
    for(const nt of notes){
      if(!nt.trim())continue;
      const nid='c'+(++noteIdx);
      h.nts[noteKey(d,nid)]={t:nt,at:noteIdx};
    }
  }

  if(errors.length)return{ok:false,errors};
  const habits=[...habitsMap.values()].map(cleanHabit).filter(Boolean);
  habits.forEach(norm);
  return{ok:true,cats,grps,habits};
}
