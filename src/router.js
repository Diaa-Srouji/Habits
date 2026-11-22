// Hash routing: #/ (Home), #/c/<category id> (Category), #/h/<habit id> (Habit), #/d/<yyyy-mm-dd> (Day), #/manage (Edit habits), #/code (Code DB).
const RE=/^#\/(c|h)\/([\w-]{1,40})\/?$/;
const DAY=/^#\/d\/(\d{4}-\d{2}-\d{2})\/?$/;
const MANAGE=/^#\/manage\/?$/;
const CODE=/^#\/code\/?$/;

export function parseHash(h=location.hash){
  if(MANAGE.test(h))return{name:'manage'};
  if(CODE.test(h))return{name:'code'};
  const d=DAY.exec(h);
  if(d)return{name:'day',id:d[1]};
  const m=RE.exec(h);
  return m?{name:m[1]==='c'?'cat':'habit',id:m[2]}:{name:'home'}}

export const href={home:'#/',manage:'#/manage',code:'#/code',cat:id=>'#/c/'+id,habit:id=>'#/h/'+id,day:k=>'#/d/'+k};

export function navigate(h){if(location.hash===h||(h==='#/'&&!location.hash))return false;location.hash=h;return true}

export function initRouter(onRoute){
  const fix=()=>{const h=location.hash;if(h&&h!=='#/'&&!RE.test(h)&&!DAY.test(h)&&!MANAGE.test(h)&&!CODE.test(h))history.replaceState(null,'','#/')};
  fix();
  addEventListener('hashchange',()=>{fix();onRoute(parseHash())});
}
