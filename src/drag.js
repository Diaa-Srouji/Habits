// The drag handle on each habit block of the Category page: puts the habits of one category in the order the person wants.
// Works with mouse, finger and pen (pointer events) and with the keyboard (focus the handle, then Up / Down arrow).
// While dragging, nothing is moved in the page: the dragged block follows the pointer and the blocks it passes slide out of its way.
// On release the new order is written as a plain number (ord) on every habit of that category, saved, and the page is drawn again.
import {S} from './state.js';
import {setOrder} from './scoring.js';
import {save} from './sync.js';
import {render} from './render.js';

const blocksOf=box=>[...box.children].filter(b=>b.classList.contains('blk'));
const focusHandle=id=>{const b=[...document.querySelectorAll('[data-drag]')].find(x=>x.dataset.drag===id);if(b)b.focus()};
// the ids of the blocks in their current order, with block i moved to place j
const reorder=(list,i,j)=>{const ids=list.map(b=>b.dataset.id);ids.splice(j,0,ids.splice(i,1)[0]);return ids};
function commit(ids,focus){setOrder(S.habits,ids);save();render();focusHandle(focus)}

export function initDrag(){
  let g=null;
  // dragged block follows the pointer; j = the place it would take if let go now
  const place=()=>{if(!g)return;
    const dy=g.y-g.y0+(scrollY-g.s0);
    g.el.style.transform=`translateY(${dy}px)`;
    const c=g.mid[g.i0]+dy;   // page position of the dragged block's centre
    let j=0;g.mid.forEach((m,k)=>{if(k!==g.i0&&m<c)j++});
    g.j=j;
    g.list.forEach((b,k)=>{if(k===g.i0)return;
      const sh=g.i0<k&&k<=j?-g.step:j<=k&&k<g.i0?g.step:0;
      b.style.transform=sh?`translateY(${sh}px)`:''})};
  // near the top or bottom edge of the screen the page scrolls by itself
  const tick=()=>{if(!g)return;
    const m=70,v=g.y<m?-Math.ceil((m-g.y)/6):g.y>innerHeight-m?Math.ceil((g.y-(innerHeight-m))/6):0;
    if(v){scrollBy(0,v);place()}
    g.raf=requestAnimationFrame(tick)};
  const end=done=>{if(!g)return;const x=g;g=null;cancelAnimationFrame(x.raf);
    x.list.forEach(b=>{b.style.transform='';b.classList.remove('dragging')});x.box.classList.remove('sorting');
    if(done&&x.j!==x.i0)commit(reorder(x.list,x.i0,x.j),x.el.dataset.id)};

  addEventListener('pointerdown',e=>{
    const hd=e.target.closest&&e.target.closest('[data-drag]');if(!hd||e.button>0||g)return;
    const el=hd.closest('.blk'),box=el&&el.parentElement;if(!box)return;
    const list=blocksOf(box);if(list.length<2)return;
    e.preventDefault();
    const rects=list.map(b=>b.getBoundingClientRect()),i0=list.indexOf(el),gap=parseFloat(getComputedStyle(box).rowGap)||14;
    g={el,box,list,i0,j:i0,y0:e.clientY,y:e.clientY,s0:scrollY,raf:0,
      mid:rects.map(r=>r.top+scrollY+r.height/2),step:rects[i0].height+gap};
    el.classList.add('dragging');box.classList.add('sorting');
    g.raf=requestAnimationFrame(tick)});
  addEventListener('pointermove',e=>{if(!g)return;g.y=e.clientY;place()});
  addEventListener('pointerup',()=>end(true));
  addEventListener('pointercancel',()=>end(false));
  addEventListener('blur',()=>end(false));

  addEventListener('keydown',e=>{
    if(g&&e.key==='Escape'){end(false);return}
    const hd=e.target.closest&&e.target.closest('[data-drag]');if(!hd)return;
    const d=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;if(!d)return;
    e.preventDefault();
    const el=hd.closest('.blk'),list=el?blocksOf(el.parentElement):[],i=list.indexOf(el),j=i+d;
    if(i<0||j<0||j>=list.length)return;
    commit(reorder(list,i,j),el.dataset.id)});
}
