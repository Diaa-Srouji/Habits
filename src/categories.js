// Categories: defaults, cleaning (for data from the cloud / imported files), and "which habits still need a category".
export const DEFAULT_CATS=[
  {id:'school',name:'School',color:'#2F7BEA',icon:'📚',order:0},
  {id:'olympiad',name:'Olympiad',color:'#E8772B',icon:'🏆',order:1},
  {id:'deen',name:'Deen',color:'#1A9850',icon:'🕌',order:2}];
const HEX=/^#[0-9a-fA-F]{6}$/,ID=/^[\w-]{1,40}$/;
export function cleanCat(c,i=0){
  if(!c||typeof c!=='object'||typeof c.id!=='string'||!ID.test(c.id)||typeof c.name!=='string'||!c.name.trim())return null;
  return {id:c.id,name:c.name.trim().slice(0,40),color:HEX.test(c.color)?c.color:'#5B6B82',
    icon:typeof c.icon==='string'?c.icon.slice(0,8):'',order:Number.isFinite(+c.order)?+c.order:i}}
// Valid categories only, no duplicate ids, sorted, order renumbered 0..n-1
export function cleanCats(arr){const seen=new Set();
  return (Array.isArray(arr)?arr:[]).map(cleanCat).filter(c=>c&&!seen.has(c.id)&&seen.add(c.id))
    .sort((a,b)=>a.order-b.order).map((c,i)=>({...c,order:i}))}
// raw = JSON text saved in the cloud / browser (or null). Falls back to the three starter categories.
export function loadCats(raw){let a=null;try{a=JSON.parse(raw)}catch(e){}
  const c=cleanCats(a);return c.length?c:DEFAULT_CATS.map(x=>({...x}))}
// Imported categories replace same-id ones; new ones are added at the end
export function mergeCats(cur,imp){const m=new Map(cur.map(c=>[c.id,c]));imp.forEach(c=>m.set(c.id,c));
  return [...m.values()].map((c,i)=>({...c,order:i}))}
export const hasCat=(h,cats)=>typeof h.cat==='string'&&cats.some(c=>c.id===h.cat);
export const unassigned=(habits,cats)=>habits.filter(h=>!hasCat(h,cats));

// Archived habits are hidden everywhere but kept. These are the ones to show and count.
export const live=habits=>habits.filter(h=>!h.archived);
export const inCat=(habits,id)=>habits.filter(h=>h.cat===id&&!h.archived);
// Starter colours offered for new categories (the first one not already used)
export const PALETTE=['#2F7BEA','#E8772B','#1A9850','#B83DBA','#10B5C9','#D9A400','#E0334C','#6C4FE0'];
export const nextColor=cats=>PALETTE.find(c=>!cats.some(x=>x.color.toLowerCase()===c.toLowerCase()))||PALETTE[cats.length%PALETTE.length];
export const newCatId=()=>'c'+Date.now().toString(36);
// Pure category edits (they return a new list; order is always renumbered 0..n-1)
export const renumber=cats=>cats.map((c,i)=>({...c,order:i}));
export function moveCat(cats,id,dir){const i=cats.findIndex(c=>c.id===id),j=i+dir;
  if(i<0||j<0||j>=cats.length)return cats;const a=cats.slice();[a[i],a[j]]=[a[j],a[i]];return renumber(a)}
