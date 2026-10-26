// Hash routing: #/ (Home), #/c/<category id> (Category), #/h/<habit id> (Habit), #/manage (Manage categories).
// Hash routes need no server rules, so they work on Firebase Hosting, file previews and the installed app.
// The browser's Back and Forward buttons work for free because every page is a real history entry.
const RE=/^#\/(c|h)\/([\w-]{1,40})\/?$/;

export function parseHash(h=location.hash){
  if(/^#\/manage\/?$/.test(h))return{name:'manage'};
  const m=RE.exec(h);
  return m?{name:m[1]==='c'?'cat':'habit',id:m[2]}:{name:'home'}}

// Link targets. Ids are already restricted to [\w-] when habits and categories are cleaned.
export const href={home:'#/',manage:'#/manage',cat:id=>'#/c/'+id,habit:id=>'#/h/'+id};

// Go to a route. Returns true when the address changed (a hashchange will follow), false when already there.
export function navigate(h){if(location.hash===h||(h==='#/'&&!location.hash))return false;location.hash=h;return true}

// onRoute(route) runs after every change of address. Unknown addresses are quietly turned into #/ (no extra history entry).
export function initRouter(onRoute){
  const fix=()=>{const h=location.hash;if(h&&h!=='#/'&&!RE.test(h)&&!/^#\/manage\/?$/.test(h))history.replaceState(null,'','#/')};
  fix();
  addEventListener('hashchange',()=>{fix();onRoute(parseHash())});
}
