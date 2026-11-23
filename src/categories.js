// Categories & nested groups (wird): defaults, cleaning, merging, reordering, and unassigned check.
export const DEFAULT_CATS=[
  {id:'school',name:'School',color:'#2F7BEA',icon:'📚',order:0},
  {id:'olympiad',name:'Olympiad',color:'#E8772B',icon:'🏆',order:1},
  {id:'deen',name:'Deen',color:'#1A9850',icon:'🕌',order:2}];
const HEX=/^#[0-9a-fA-F]{6}$/,ID=/^[\w-]{1,40}$/;
export function cleanCat(c,i=0){
  if(!c||typeof c!=='object'||typeof c.id!=='string'||!ID.test(c.id)||typeof c.name!=='string'||!c.name.trim())return null;
  return {id:c.id,name:c.name.trim().slice(0,40),color:HEX.test(c.color)?c.color:'#5B6B82',
    icon:typeof c.icon==='string'?c.icon.slice(0,8):'',order:Number.isFinite(+c.order)?+c.order:i}}
export function cleanCats(arr){const seen=new Set();
  return (Array.isArray(arr)?arr:[]).map(cleanCat).filter(c=>c&&!seen.has(c.id)&&seen.add(c.id))
    .sort((a,b)=>a.order-b.order).map((c,i)=>({...c,order:i}))}
export function loadCats(raw){let a=null;try{a=JSON.parse(raw)}catch(e){}
  const c=cleanCats(a);return c.length?c:DEFAULT_CATS.map(x=>({...x}))}
export function mergeCats(cur,imp){const m=new Map(cur.map(c=>[c.id,c]));imp.forEach(c=>m.set(c.id,c));
  return [...m.values()].map((c,i)=>({...c,order:i}))}
export const hasCat=(h,cats)=>typeof h.cat==='string'&&cats.some(c=>c.id===h.cat);
export const unassigned=(habits,cats)=>habits.filter(h=>!hasCat(h,cats));

export const live=habits=>habits.filter(h=>!h.archived);
export const inCat=(habits,id)=>habits.filter(h=>h.cat===id&&!h.archived);
export const PALETTE=['#2F7BEA','#E8772B','#1A9850','#B83DBA','#10B5C9','#D9A400','#E0334C','#6C4FE0'];
export const nextColor=cats=>PALETTE.find(c=>!cats.some(x=>x.color.toLowerCase()===c.toLowerCase()))||PALETTE[cats.length%PALETTE.length];
export const newCatId=()=>'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,4);
export const renumber=cats=>cats.map((c,i)=>({...c,order:i}));
export function moveCat(cats,id,dir){const i=cats.findIndex(c=>c.id===id),j=i+dir;
  if(i<0||j<0||j>=cats.length)return cats;const a=cats.slice();[a[i],a[j]]=[a[j],a[i]];return renumber(a)}

// ---- Nested Groups (wird inside a category, and sub-groups inside groups) ----
// S.grps = [{id, cat, name, order, parent?}]. parent is an optional group id in the same category.
export function cleanGroup(g,i=0){
  if(!g||typeof g!=='object'||typeof g.id!=='string'||!ID.test(g.id)||typeof g.cat!=='string'||!ID.test(g.cat)||typeof g.name!=='string'||!g.name.trim())return null;
  const out={id:g.id,cat:g.cat,name:g.name.trim().slice(0,40),order:Number.isFinite(+g.order)?+g.order:i};
  if(typeof g.parent==='string'&&ID.test(g.parent)&&g.parent!==g.id)out.parent=g.parent;
  return out}

export function renumberGrps(grps){
  const n={};
  return grps.map((g,i)=>[g,i]).sort((a,b)=>a[0].order-b[0].order||a[1]-b[1]).map(([g])=>{
    const key=g.cat+'|'+(g.parent||'');
    return {...g,order:n[key]=(n[key]===undefined?0:n[key]+1)};
  });
}

export function cleanGrps(arr,cats){
  const seen=new Set();
  const list=(Array.isArray(arr)?arr:[]).map(cleanGroup)
    .filter(g=>g&&!seen.has(g.id)&&seen.add(g.id)&&(!cats||cats.some(c=>c.id===g.cat)));
  const byId=new Map(list.map(g=>[g.id,g]));
  // Ensure every parent exists in the same category and has no cycles
  for(const g of list){
    if(!g.parent)continue;
    let cur=g.parent,ok=true;const vis=new Set([g.id]);
    while(cur){
      if(vis.has(cur)){ok=false;break}
      vis.add(cur);
      const p=byId.get(cur);
      if(!p||p.cat!==g.cat){ok=false;break}
      cur=p.parent;
    }
    if(!ok)delete g.parent;
  }
  return renumberGrps(list);
}

export function loadGrps(raw,cats){let a=null;try{a=JSON.parse(raw)}catch(e){}return cleanGrps(a,cats)}
export function mergeGrps(cur,imp,cats){const m=new Map(cur.map(g=>[g.id,g]));imp.forEach(g=>m.set(g.id,g));return cleanGrps([...m.values()],cats)}
export const groupsOf=(grps,cat)=>grps.filter(g=>g.cat===cat).sort((a,b)=>a.order-b.order);
export const childGroups=(grps,cat,parentId=null)=>grps.filter(g=>g.cat===cat&&(g.parent||null)===(parentId||null)).sort((a,b)=>a.order-b.order);

// Returns a Set containing grpId and all nested sub-group ids under it (cycle-safe)
export function descendantGroupIds(grps,grpId){
  const ids=new Set([grpId]);let added=true;
  while(added){added=false;for(const g of grps)if(g.parent&&ids.has(g.parent)&&!ids.has(g.id)){ids.add(g.id);added=true}}
  return ids;
}

// Direct habits of a group
export const inGroup=(habits,g)=>habits.filter(h=>h.cat===g.cat&&h.grp===g.id&&!h.archived);
// Habits of a group INCLUDING all its nested sub-groups (used for combined heatmaps, progress and totals)
export function inGroupDeep(habits,grps,g){
  const ids=descendantGroupIds(grps,g.id);
  return habits.filter(h=>h.cat===g.cat&&ids.has(h.grp)&&!h.archived);
}
export const loose=(habits,cat,grps)=>habits.filter(h=>h.cat===cat&&!h.archived&&!grps.some(g=>g.cat===cat&&g.id===h.grp));
export const newGrpId=()=>'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,4);

// Breadcrumb path for dropdowns, e.g. "Wird › Morning"
export function groupPath(grps,grpId){
  const byId=new Map(grps.map(g=>[g.id,g])),parts=[],vis=new Set();
  let cur=byId.get(grpId);
  while(cur&&!vis.has(cur.id)){vis.add(cur.id);parts.unshift(cur.name);cur=cur.parent?byId.get(cur.parent):null}
  return parts.join(' › ');
}

// Flat list of groups of a category in tree order (for dropdowns)
export function groupTreeList(grps,cat,parentId=null,depth=0){
  const out=[];
  for(const g of childGroups(grps,cat,parentId)){
    out.push({g,depth});
    out.push(...groupTreeList(grps,cat,g.id,depth+1));
  }
  return out;
}

// Move a group up (-1) or down (+1) among its siblings (same category and same parent)
export function moveGrp(grps,id,dir){
  const g=grps.find(x=>x.id===id);if(!g)return grps;
  const pid=g.parent||null;
  const ids=childGroups(grps,g.cat,pid).map(x=>x.id),i=ids.indexOf(id),j=i+dir;
  if(j<0||j>=ids.length)return grps;
  [ids[i],ids[j]]=[ids[j],ids[i]];
  return renumberGrps(grps.map(x=>x.cat===g.cat&&(x.parent||null)===pid?{...x,order:ids.indexOf(x.id)}:x));
}
