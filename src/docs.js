// Per-habit cloud documents: the pure logic (no Firebase, no DOM), so it can be tested in Node.
//
// A habit document is compared at FIELD level: every top-level field (name, goal, cat ...) and every
// date inside done / skip / off / notes is one "slot". Two devices that change different slots never conflict.
import {cleanCats,DEFAULT_CATS,loadCats} from './categories.js';

export const HABIT_MAPS=['done','skip','off','notes'],CATS_MAPS=['cats'];
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));   // also drops undefined fields (Firestore refuses them)
// JSON with sorted keys: Firestore returns map fields in alphabetical order, so plain JSON.stringify would call equal things different
const stable=v=>JSON.stringify(v,(k,x)=>isObj(x)?Object.fromEntries(Object.keys(x).sort().map(y=>[y,x[y]])):x);
export const same=(a,b)=>stable(a)===stable(b);
export const validId=id=>typeof id==='string'&&/^[\w-]{1,40}$/.test(id);

// A habit as stored in its document: a plain copy, id = document id, the four maps always present. null if unusable.
export function toHabit(d,id=d&&d.id){
  if(!isObj(d)||!validId(id)||typeof d.name!=='string')return null;
  const h=clone(d);h.id=id;for(const m of HABIT_MAPS)if(!isObj(h[m]))h[m]={};return h}

// Habits are listed by id (ids start with the creation time, so this is creation order, the same on every device)
export const sortHabits=a=>a.sort((x,y)=>x.id.length-y.id.length||(x.id<y.id?-1:x.id>y.id?1:0));

// ---- slots -----------------------------------------------------------------------------------------------
function flat(doc,maps){const m=new Map();if(!isObj(doc))return m;
  for(const k of Object.keys(doc)){const v=doc[k];
    if(maps.includes(k)&&isObj(v)){for(const s of Object.keys(v))if(v[s]!==undefined)m.set(k+'\0'+s,{path:[k,s],value:v[s]})}
    else if(v!==undefined)m.set(k,{path:[k],value:v})}
  return m}
// What changed going from base to cur: [{path:['done','2026-10-26'],value:30} | {path:[...],del:true}]. A missing map equals an empty one.
export function diff(base,cur,maps){const a=flat(base,maps),b=flat(cur,maps),ops=[];
  for(const [k,x] of b)if(!a.has(k)||!same(a.get(k).value,x.value))ops.push({path:x.path,value:clone(x.value)});
  for(const [k,x] of a)if(!b.has(k))ops.push({path:x.path,del:true});
  return ops}
// A copy of doc with the ops applied
export function apply(doc,ops,maps){const d=clone(doc)||{};
  for(const o of ops){const [k,s]=o.path;
    if(s===undefined){if(o.del)delete d[k];else d[k]=clone(o.value)}
    else{if(!isObj(d[k]))d[k]={};if(o.del)delete d[k][s];else d[k][s]=clone(o.value)}}
  return d}
// The cloud's newest version with this device's unconfirmed edits (local vs the last confirmed base) laid back on top
export const rebase=(base,local,remote,maps)=>apply(remote,diff(base,local,maps),maps);

// ---- categories: one document {cats:{<id>:{...}}} ---------------------------------------------------------
export const catsToDoc=cats=>({cats:Object.fromEntries(cats.map(c=>[c.id,clone(c)]))});
export function docToCats(d){const c=cleanCats(Object.values(isObj(d)&&isObj(d.cats)?d.cats:{}));return c.length?c:DEFAULT_CATS.map(x=>({...x}))}
export const normCats=d=>catsToDoc(docToCats(d));

// ---- the one-time move from the old single document ---------------------------------------------------------
// habits = the old array, catsRaw = the old JSON text of the categories (or null). Habits that cannot be stored are counted, not lost:
// the old document is never changed.
export function planMigration(habits,catsRaw){const seen=new Map();let skipped=0;
  for(const raw of Array.isArray(habits)?habits:[]){const h=toHabit(raw);if(!h||seen.has(h.id)){skipped++;continue}seen.set(h.id,h)}
  return{habits:[...seen.values()],cats:loadCats(catsRaw),skipped}}
