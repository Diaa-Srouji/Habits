// Entry point: wires the modules together and starts watching the sign-in state.
import {S} from './state.js';
import {$,K,T} from './util.js';
import {render} from './render.js';
import {watchAuth} from './sync.js';
import {initEvents} from './events.js';
import {initHeatmapEvents} from './heatmap.js';
import {initRouter} from './router.js';

initEvents();          // buttons, forms, theme, sign-in, backup (must come before the heatmap listeners)
initHeatmapEvents();   // popover, hover, keyboard

// A new page (link, Back or Forward): drop half-finished edits, return to today, scroll up, redraw.
// S.keepDay is set when a link asks for a specific day ("Edit this day").
initRouter(()=>{if($('app').hidden)return;
  if(S.keepDay)S.keepDay=false;else S.day=K(T());
  S.draft={};S.noteDraft=null;S.skipFor=null;S.delCat=null;S.catMsg='';S.saved=false;render();window.scrollTo(0,0);
  // Screen readers: announce the new page by moving focus to its heading (keyboard users start at the top of the page)
  const hd=document.querySelector('#page .dname,#detail .dname,#home h2');if(hd){hd.tabIndex=-1;hd.focus({preventScroll:true})}});

watchAuth({
  onOut(){$('auth').hidden=false;$('app').hidden=true;$('who').hidden=true},
  onIn(u){$('auth').hidden=true;$('app').hidden=false;$('who').hidden=false;$('mail').textContent=u.email;render()},
  onRemote(){if(!(document.activeElement&&document.activeElement.tagName==='TEXTAREA'))render()}
});

// Installable / offline: only in the built site (not in `npm run dev`), only on https or localhost
if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))  
addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));