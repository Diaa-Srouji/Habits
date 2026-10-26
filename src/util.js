// Small pure helpers shared by every module.
export const p2=n=>String(n).padStart(2,'0');
export const K=d=>d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
export const add=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
export const T=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
export const mondayOf=d=>add(d,-((d.getDay()+6)%7));
export const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export const $=id=>document.getElementById(id);
export const dateOf=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
export const pct=(a,b)=>b?Math.round(a/b*100):0;
export const fmt=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'})};
