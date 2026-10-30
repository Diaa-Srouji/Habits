// Unit tests for the pure habit logic in src/scoring.js (no DOM, no Firebase).
// Run with:  npm test   (uses Node's built-in test runner, nothing to install)
//
// Dates are written relative to today (day(0) = today, day(-1) = yesterday) because the
// scoring code always compares against the real current date.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {K,T,add} from '../src/util.js';
import {ok,streak,best,pctOf,dayPercent,paint,pctText,amtPct,shortAmt,SHORT,imp,setAmt,norm,isOff,cleanHabit,
  sumOf,dayNotes,isManual,addNote,setNote,delNote,moveNote,resetNoteOrder,pruneEmpty,textDays,noteKey,
  FZ,FZE,isFrozen,isFrozenNow,freezeState,freeze,unfreeze,unfreezeDay,extendFreeze,minutesToday,minText,todayStats,todayOf,count,
  goalOn,setGoal,goalHistory,needsGoalLog,amtFull,goalVal} from '../src/scoring.js';

const day=n=>K(add(T(),n));
// A regular "30 minutes a day" habit created 10 days ago. Override any field with `o`.
const habit=(o={})=>({id:'h1',name:'Test',type:'min',stop:false,goal:30,unit:'min',created:day(-10),done:{},skip:{},off:{},notes:{},...o});
// Log the same amount on each listed day offset, e.g. logs(h,30,0,-1,-2)
const logs=(h,v,...offs)=>{offs.forEach(n=>{h.done[day(n)]=v});return h};
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`expected ${a} to be close to ${b}`);

describe('streak: regular habits',()=>{
  test('no logs gives 0',()=>assert.equal(streak(habit()),0));
  test('counts consecutive logged days ending today',()=>assert.equal(streak(logs(habit(),30,0,-1,-2)),3));
  test('today not logged yet does not break the streak',()=>assert.equal(streak(logs(habit(),30,-1,-2)),2));
  test('a missed day breaks it',()=>assert.equal(streak(logs(habit(),30,0,-2)),1));
  test('yesterday and today both missing means no streak',()=>assert.equal(streak(logs(habit(),30,-2,-3)),0));
  test('never counts days before the habit was created',()=>assert.equal(streak(logs(habit({created:day(-2)}),30,0,-1,-2,-3,-4)),3));
  test('any positive amount counts, even far below the goal',()=>assert.equal(streak(logs(habit(),1,0,-1)),2));
});

describe('streak and best: skipped days (off)',()=>{
  test('isOff is true for any reason text, false when absent',()=>{
    const h=habit({off:{[day(-1)]:'Ill'}});assert.equal(isOff(h,day(-1)),true);assert.equal(isOff(h,day(0)),false)});
  test('a skipped day neither breaks nor adds to the streak',()=>{
    const h=logs(habit({off:{[day(-2)]:'Travel'}}),30,0,-1,-3);assert.equal(streak(h),3)});
  test('several skipped days in a row are bridged',()=>{
    const h=logs(habit({off:{[day(-1)]:'Ill',[day(-2)]:'Ill'}}),30,0,-3);assert.equal(streak(h),2)});
  test('skipping today keeps yesterday\'s streak alive',()=>{
    const h=logs(habit({off:{[day(0)]:'Rest'}}),30,-1,-2);assert.equal(streak(h),2)});
  test('best also bridges skipped days',()=>{
    const h=logs(habit({off:{[day(-2)]:'Busy'}}),30,-1,-3);assert.equal(best(h),2)});
  test('a skipped day does not rescue a day that was really missed',()=>{
    const h=logs(habit({off:{[day(-1)]:'Busy'}}),30,0,-3);assert.equal(streak(h),1)});
});

describe('best',()=>{
  test('no logs gives 0',()=>assert.equal(best(habit()),0));
  test('finds the longest run, not the latest',()=>{
    const h=logs(habit(),30,-9,-8,-7,-5,-4,0);assert.equal(best(h),3)});
  test('is kept after the current streak is broken',()=>{
    const h=logs(habit(),30,-6,-5,-4,-3);assert.equal(h.done[day(-1)],undefined);assert.equal(streak(h),0);assert.equal(best(h),4)});
  test('is never smaller than the current streak',()=>{
    const h=logs(habit(),30,0,-1,-2,-3,-4);assert.ok(best(h)>=streak(h));assert.equal(best(h),5)});
});

describe('ok(): stop habits (less is better)',()=>{
  const stop=(o={})=>habit({stop:true,goal:60,...o});
  test('a past day with nothing logged is a success (counts as 0)',()=>assert.equal(ok(stop(),day(-1)),true));
  test('today with nothing logged is not a success yet',()=>assert.equal(ok(stop(),day(0)),false));
  test('today deliberately logged as 0 (skip marker) is a success',()=>assert.equal(ok(stop({skip:{[day(0)]:1}}),day(0)),true));
  test('at or under the limit is a success',()=>{
    const h=stop({done:{[day(-1)]:20,[day(-2)]:60}});assert.equal(ok(h,day(-1)),true);assert.equal(ok(h,day(-2)),true)});
  test('over the limit but up to 200% of it still keeps the streak',()=>{const h=stop({done:{[day(-1)]:61,[day(-2)]:120}});assert.equal(ok(h,day(-1)),true);assert.equal(ok(h,day(-2)),true)});
  test('more than 200% of the limit is a failure',()=>assert.equal(ok(stop({done:{[day(-1)]:121}}),day(-1)),false));
  test('true/false stop habit: any amount means "slipped"',()=>{
    const h=stop({type:'bool',goal:1,done:{[day(-1)]:1}});assert.equal(ok(h,day(-1)),false);assert.equal(ok(h,day(-2)),true)});
  test('regular habit: only a logged amount counts',()=>{
    const h=habit({done:{[day(-1)]:5}});assert.equal(ok(h,day(-1)),true);assert.equal(ok(h,day(-2)),false)});
});

describe('streak and best: stop habits',()=>{
  const stop=(o={})=>habit({stop:true,goal:60,created:day(-5),...o});
  test('unlogged days since creation all count; today is pending so it is not counted',()=>assert.equal(streak(stop()),5));
  test('today deliberately logged as 0 adds one more day',()=>assert.equal(streak(stop({skip:{[day(0)]:1}})),6));
  test('today under the limit counts',()=>assert.equal(streak(stop({done:{[day(0)]:10}})),6));
  test('going over 200% of the limit resets the streak',()=>assert.equal(streak(stop({done:{[day(-2)]:130}})),1));
  test('going over 200% of the limit today means no streak',()=>assert.equal(streak(stop({done:{[day(0)]:130}})),5));
  test('between 100% and 200% of the limit the streak continues',()=>assert.equal(streak(stop({done:{[day(0)]:100}})),6));
  test('true/false stop habit: a slip breaks the streak',()=>{
    const h=stop({type:'bool',goal:1,done:{[day(-3)]:1}});assert.equal(streak(h),2)});
  test('best: slip near the start leaves a longer later run',()=>assert.equal(best(stop({done:{[day(-4)]:130}})),3));
  test('best: slip in the middle splits the run in two',()=>assert.equal(best(stop({done:{[day(-3)]:130}})),2));
  test('skipped (off) days are bridged: day -1 and -3 count, -2 is skipped, the slip on -4 stops it',()=>{
    const h=stop({done:{[day(-4)]:130},off:{[day(-2)]:'Travel'}});assert.equal(streak(h),2)});
});

describe('pctOf: regular habits (goal 30)',()=>{
  const h=habit();
  test('a logged zero is 0%',()=>near(pctOf(h,0),0));
  test('amount / goal',()=>{near(pctOf(h,15),.5);near(pctOf(h,30),1);near(pctOf(h,45),1.5)});
  test('is not capped: 250% and 1000% are possible',()=>{near(pctOf(h,75),2.5);near(pctOf(h,300),10)});
  test('works with a fractional goal (1.5 hours)',()=>near(pctOf(habit({type:'hour',goal:1.5}),3),2));
});
describe('pctOf: stop habits (limit 60)',()=>{
  const h=habit({stop:true,goal:60});
  test('none, and anything up to the limit, is 100%',()=>{near(pctOf(h,0),1);near(pctOf(h,30),1);near(pctOf(h,60),1)});
  test('falls linearly above the limit',()=>{near(pctOf(h,90),.5);near(pctOf(h,108),.2)});
  test('0% at double the limit, never negative',()=>{near(pctOf(h,120),0);near(pctOf(h,999),0)});
});
describe('pctOf: true/false habits',()=>{
  test('regular: done is 100%, not done 0%',()=>{const h=habit({type:'bool',goal:1});near(pctOf(h,1),1);near(pctOf(h,0),0)});
  test('stop: avoided is 100%, slipped 0%',()=>{const h=habit({type:'bool',goal:1,stop:true});near(pctOf(h,0),1);near(pctOf(h,1),0)});
});
describe('text helpers and shortcuts',()=>{
  test('pctText rounds to a whole percent',()=>{assert.equal(pctText(1.5),'150%');assert.equal(pctText(.333),'33%')});
  test('amtPct shows the amount against the goal or the limit',()=>{
    assert.equal(amtPct(habit(),45),'150% of goal');assert.equal(amtPct(habit({stop:true,goal:60}),30),'50% of limit');assert.equal(amtPct(habit({type:'bool',goal:1}),1),'')});
  test('shortcuts are 0, 50%, 100%, 150% and 200% of the goal',()=>assert.deepEqual(SHORT.map(m=>shortAmt(habit(),m)),[0,15,30,45,60]));
  test('importance defaults to 3 and must be 1 to 5',()=>{
    assert.equal(imp({}),3);assert.equal(imp({importance:5}),5);assert.equal(imp({importance:9}),3);assert.equal(imp({importance:0}),3)});
});

describe('dayPercent: combining habits by importance',()=>{
  const reg=(id,o={})=>habit({id,...o});
  const D=day(-1);
  test('weighted average: importance 5 at 100% and importance 1 at 0% gives 5/6',()=>{
    const a=reg('a',{importance:5,done:{[D]:30}}),b=reg('b',{importance:1,skip:{[D]:1}});near(dayPercent([a,b],D,false),5/6)});
  test('equal importance averages the percentages',()=>{
    const a=reg('a',{done:{[D]:30}}),b=reg('b',{done:{[D]:15}});near(dayPercent([a,b],D,false),.75)});
  test('a habit counts for at most 200% inside the average',()=>{
    const a=reg('a',{done:{[D]:3000}}),b=reg('b',{skip:{[D]:1}});near(dayPercent([a,b],D,false),1)});
  test('a skipped (off) day contributes nothing at all',()=>{
    const a=reg('a',{done:{[D]:30}}),b=reg('b',{off:{[D]:'Ill'}});near(dayPercent([a,b],D,false),1)});
  test('a past day with an unlogged regular habit counts it as 0%',()=>{
    const a=reg('a',{done:{[D]:30}}),b=reg('b');near(dayPercent([a,b],D,false),.5)});
  test('today: unlogged habits are left out until the day ends',()=>{
    const a=reg('a',{done:{[day(0)]:30}}),b=reg('b');near(dayPercent([a,b],day(0),true),1)});
  test('an unlogged stop habit is no data',()=>{
    const a=reg('a',{done:{[D]:30}}),b=reg('b',{stop:true,goal:60});near(dayPercent([a,b],D,false),1)});
  test('nothing logged at all gives null (empty cell)',()=>assert.equal(dayPercent([reg('a'),reg('b')],D,false),null));
  test('habits that did not exist yet are ignored',()=>{
    const a=reg('a',{done:{[D]:30}}),b=reg('b',{created:day(0)});near(dayPercent([a,b],D,false),1)});
  test('every habit skipped gives null',()=>assert.equal(dayPercent([reg('a',{off:{[D]:'Ill'}})],D,false),null));
});

describe('paint: the green scale',()=>{
  test('0% is red',()=>{const g=paint(0);assert.ok(g.cls.includes('gz'));assert.equal(g.style,'')});
  test('above 0% up to 100% is green, from pale to the good green',()=>{
    const lo=paint(.01),mid=paint(.5),top=paint(1);
    assert.ok(!lo.cls.includes('gz'));assert.match(lo.style,/--ga:var\(--g0\);--gb:var\(--g1\);--f:1\.0%/);
    assert.match(mid.style,/--f:50\.0%/);assert.match(top.style,/--f:100\.0%/)});
  test('100% to 200% deepens from the good green to the deep green',()=>{
    assert.match(paint(1.5).style,/--ga:var\(--g1\);--gb:var\(--g2\);--f:50\.0%/);assert.match(paint(2).style,/--g2|--f:100\.0%/)});
  test('above 200% the colour stays and there is no glow unless asked for',()=>{
    assert.equal(paint(3).style,paint(2).style);assert.ok(!paint(3).cls.includes('gl'))});
  test('glow grows from 200% to 500%, shimmer from 500%',()=>{
    assert.ok(!paint(2,true).cls.includes('gl'));
    const g=paint(3.5,true);assert.ok(g.cls.includes('gl'));assert.ok(!g.cls.includes('gs'));assert.match(g.style,/--w:0\.50/);
    const m=paint(5,true);assert.ok(m.cls.includes('gs'));assert.match(m.style,/--w:1\.00/);assert.match(paint(50,true).style,/--w:1\.00/)});
  test('colour never changes from one value to the next by accident: values below 200% are all different',()=>{
    const seen=new Set();for(let i=1;i<=200;i++)seen.add(paint(i/100).style);assert.equal(seen.size,200)});
});

describe('setAmt and norm',()=>{
  test('a positive amount is stored and clears any skip marker',()=>{
    const h=habit({skip:{[day(-1)]:1}});setAmt(h,day(-1),25);assert.equal(h.done[day(-1)],25);assert.equal(h.skip[day(-1)],undefined)});
  test('0 records a deliberate zero (skip marker) and removes the amount',()=>{
    const h=habit({done:{[day(-1)]:25}});setAmt(h,day(-1),0);assert.equal(h.done[day(-1)],undefined);assert.equal(h.skip[day(-1)],1)});
  test('null puts the day back to "not logged"',()=>{
    const h=habit({done:{[day(-1)]:25},skip:{[day(-2)]:1}});setAmt(h,day(-1),null);setAmt(h,day(-2),null);
    assert.deepEqual(h.done,{});assert.deepEqual(h.skip,{})});
  test('negative or junk input becomes a deliberate zero',()=>{
    const h=habit();setAmt(h,day(-1),-5);assert.equal(h.skip[day(-1)],1);setAmt(h,day(-2),'abc');assert.equal(h.skip[day(-2)],1)});
  test('logging a day before the creation date moves the creation date back',()=>{
    const h=habit({created:day(-3)});setAmt(h,day(-6),10);assert.equal(h.created,day(-6))});
  test('norm fills in missing fields without touching existing data',()=>{
    const h={id:'a',name:'A',goal:20,unit:'min',done:{[day(-2)]:20}};norm(h);
    assert.equal(h.type,'min');assert.equal(h.stop,false);assert.equal(h.created,day(-2));assert.deepEqual(h.off,{});assert.equal(h.goal,20)});
});

describe('What did you do? and several notes per day',()=>{
  const D=day(-1),E=day(-2);
  const withNotes=()=>{const h=habit();h.sum={};h.nts={
    [noteKey(D,'b')]:{t:'second',at:2000},[noteKey(D,'a')]:{t:'first',at:1000},[noteKey(D,'c')]:{t:'third',at:3000},[noteKey(E,'x')]:{t:'other day',at:1}};return h};

  test('notes of a day are sorted by the time they were added, other days are left out',()=>{
    assert.deepEqual(dayNotes(withNotes(),D).map(n=>n.t),['first','second','third']);
    assert.deepEqual(dayNotes(withNotes(),E).map(n=>n.t),['other day']);
    assert.deepEqual(dayNotes(withNotes(),day(-5)),[])});
  test('summary: missing is an empty string',()=>{const h=habit();assert.equal(sumOf(h,D),'');h.sum={[D]:'Solved 5'};assert.equal(sumOf(h,D),'Solved 5')});
  test('addNote makes an empty note at the end; text can be set and the note deleted',()=>{
    const h=withNotes(),id=addNote(h,D);assert.deepEqual(dayNotes(h,D).map(n=>n.id).pop(),id);
    setNote(h,D,id,'hello');assert.equal(dayNotes(h,D).pop().t,'hello');
    delNote(h,D,id);assert.equal(dayNotes(h,D).length,3)});
  test('moving a note up or down writes a manual order; the first move on a day orders every note',()=>{
    const h=withNotes();assert.equal(isManual(h,D),false);
    assert.equal(moveNote(h,D,'c',-1),true);
    assert.deepEqual(dayNotes(h,D).map(n=>n.t),['first','third','second']);assert.equal(isManual(h,D),true);
    assert.equal(isManual(h,E),false,'another day is untouched');
    assert.equal(moveNote(h,D,'a',-1),false,'cannot move the first note up');
    assert.equal(moveNote(h,D,'b',1),false,'cannot move the last note down');
    assert.deepEqual(dayNotes(h,D).map(n=>n.t),['first','third','second'])});
  test('a new note on a manually ordered day goes to the end of the order',()=>{
    const h=withNotes();moveNote(h,D,'c',-1);const id=addNote(h,D);assert.equal(dayNotes(h,D).pop().id,id)});
  test('"Sort by date" removes the manual order again',()=>{
    const h=withNotes();moveNote(h,D,'c',-1);resetNoteOrder(h,D);
    assert.equal(isManual(h,D),false);assert.deepEqual(dayNotes(h,D).map(n=>n.t),['first','second','third'])});
  test('manual order wins over time; notes without an order (added on another device) come last, by time',()=>{
    const h=withNotes();moveNote(h,D,'c',-1);h.nts[noteKey(D,'z')]={t:'late',at:1};
    assert.deepEqual(dayNotes(h,D).map(n=>n.t),['first','third','second','late'])});
  test('pruneEmpty drops empty notes except on the day being edited',()=>{
    const h=withNotes();h.nts[noteKey(D,'e1')]={t:'',at:5};h.nts[noteKey(E,'e2')]={t:'  ',at:5};
    pruneEmpty(h,D);assert.ok(noteKey(D,'e1') in h.nts);assert.ok(!(noteKey(E,'e2') in h.nts));
    pruneEmpty(h,null);assert.ok(!(noteKey(D,'e1') in h.nts));assert.equal(dayNotes(h,D).length,3)});
  test('textDays lists days with a summary or a note (the heatmap dot)',()=>{
    const h=withNotes();h.sum={[day(-3)]:'ran'};h.nts[noteKey(day(-4),'e')]={t:'',at:1};
    assert.deepEqual([...textDays(h)].sort(),[E,D,day(-3)].sort())});
  test('old one-note-per-day notes become the first note of that day, and only once',()=>{
    const h=habit({notes:{[D]:'old thought',[E]:'   '}});norm(h);
    assert.deepEqual(h.notes,{});assert.deepEqual(dayNotes(h,D).map(n=>[n.id,n.t,n.at]),[['old','old thought',0]]);assert.deepEqual(dayNotes(h,E),[]);
    h.nts[noteKey(D,'mine')]={t:'new',at:9};norm(h);assert.deepEqual(dayNotes(h,D).map(n=>n.t),['old thought','new'])});
  test('two devices converting the same old note make the identical entry (nothing doubles when they sync)',()=>{
    const a=habit({notes:{[D]:'same'}}),b=habit({notes:{[D]:'same'}});norm(a);norm(b);assert.deepEqual(a.nts,b.nts)});
  test('norm gives every habit the sum and nts maps',()=>{const h=habit();delete h.notes;norm(h);assert.deepEqual([h.sum,h.nts,h.notes],[{},{},{}])});
  test('import keeps the summary and notes, drops malformed entries and old backups still load',()=>{
    const c=cleanHabit({...habit(),sum:{[D]:'did it','bad':'x',[E]:''},nts:{[noteKey(D,'a')]:{t:'ok',at:5,o:1},[noteKey(D,'b')]:{t:'',at:1},'junk':{t:'x'},[noteKey(D,'c')]:'str',[noteKey(D,'d')]:{t:'<b>x</b>',at:'nope'}},notes:{[D]:'legacy'}});
    assert.deepEqual(c.sum,{[D]:'did it'});
    assert.deepEqual(c.nts,{[noteKey(D,'a')]:{t:'ok',at:5,o:1},[noteKey(D,'d')]:{t:'<b>x</b>',at:0}});
    assert.deepEqual(c.notes,{[D]:'legacy'});
    const old=cleanHabit(habit({notes:{[D]:'only old'}}));assert.deepEqual(old.sum,{});assert.deepEqual(old.nts,{});norm(old);assert.equal(dayNotes(old,D)[0].t,'only old')});
});

describe('freeze',()=>{
  test('freezing an unlogged habit starts today and counts as frozen now',()=>{
    const h=habit();assert.equal(freeze(h),day(0));
    assert.deepEqual(h.off,{[day(0)]:FZ});assert.equal(isFrozenNow(h),true);assert.equal(isFrozen(h,day(0)),true);assert.equal(freezeState(h).since,day(0))});
  test('if today is already logged the freeze starts tomorrow (pending), and nothing logged is hidden',()=>{
    const h=logs(habit(),30,0);assert.equal(freeze(h),day(1));
    const st=freezeState(h);assert.equal(st.on,false);assert.equal(st.pending,true);assert.equal(isOff(h,day(0)),false)});
  test('if today is already skipped the freeze starts tomorrow',()=>{
    const h=habit({off:{[day(0)]:'Ill'}});assert.equal(freeze(h),day(1));assert.equal(h.off[day(0)],'Ill')});
  test('cannot freeze twice',()=>{const h=habit();freeze(h);assert.equal(freeze(h),null)});
  test('a freeze goes on by itself: missed days are filled in up to today',()=>{
    const h=habit({off:{[day(-3)]:FZ}});assert.equal(extendFreeze(h),true);
    assert.deepEqual(Object.keys(h.off).sort(),[day(-3),day(-2),day(-1),day(0)]);
    assert.equal(freezeState(h).since,day(-3));assert.equal(extendFreeze(h),false)});
  test('extending never overwrites a day that already has a reason',()=>{
    const h=habit({off:{[day(-2)]:FZ,[day(-1)]:'Ill'}});extendFreeze(h);assert.equal(h.off[day(-1)],'Ill');assert.equal(h.off[day(0)],FZ)});
  test('frozen days are left out of percentages, streaks and the done-today count',()=>{
    const h=logs(habit({off:{[day(0)]:FZ,[day(-1)]:FZ}}),30,-2,-3);
    assert.equal(streak(h),2);assert.deepEqual(todayOf([h]),{done:0,total:0});
    assert.equal(dayPercent([h],day(-1),false),null)});
  test('a frozen day never breaks the streak',()=>{
    const h=logs(habit({off:{[day(-1)]:FZ}}),30,0,-2);assert.equal(streak(h),2)});
  test('unfreeze: today is normal again, earlier days stay frozen and the last one is marked as the end',()=>{
    const h=habit({off:{[day(-2)]:FZ,[day(-1)]:FZ,[day(0)]:FZ}});assert.equal(unfreeze(h),true);
    assert.deepEqual(h.off,{[day(-2)]:FZ,[day(-1)]:FZE});assert.equal(isFrozenNow(h),false);
    assert.equal(isOff(h,day(0)),false);assert.equal(isFrozen(h,day(-1)),true);
    assert.equal(extendFreeze(h),false);assert.equal(isOff(h,day(0)),false)});   // the app opening again does not re-freeze it
  test('unfreeze a freeze that has not started yet just removes it',()=>{
    const h=logs(habit(),30,0);freeze(h);assert.equal(unfreeze(h),true);assert.deepEqual(h.off,{})});
  test('unfreeze when not frozen does nothing',()=>assert.equal(unfreeze(habit()),false));
  test('freeze again after an unfreeze gives a new "since"',()=>{
    const h=habit({off:{[day(-5)]:FZ,[day(-4)]:FZE}});assert.equal(freezeState(h).on,false);
    freeze(h);assert.equal(freezeState(h).since,day(0));assert.equal(freezeState(h).on,true)});
  test('a skipped day is not a frozen day',()=>{const h=habit({off:{[day(0)]:'Ill'}});assert.equal(isFrozen(h,day(0)),false);assert.equal(isFrozenNow(h),false)});
  test('the frozen marker survives a backup import',()=>{
    const c=cleanHabit(habit({off:{[day(-1)]:FZ,[day(0)]:FZE}}));assert.equal(c.off[day(-1)],FZ);assert.equal(c.off[day(0)],FZE)});
});

describe('freeze: undo one day',()=>{
  test('a day in the middle becomes normal, its neighbours stay frozen, and the app does not fill it in again',()=>{
    const h=habit({off:{[day(-3)]:FZ,[day(-2)]:FZ,[day(-1)]:FZ,[day(0)]:FZ}});
    assert.equal(unfreezeDay(h,day(-2)),true);
    assert.equal(isOff(h,day(-2)),false);assert.equal(isFrozen(h,day(-3)),true);assert.equal(isFrozen(h,day(-1)),true);
    assert.equal(extendFreeze(h),false);assert.equal(isOff(h,day(-2)),false);assert.equal(isFrozenNow(h),true)});
  test('that day can then be logged like any other, and counts again',()=>{
    const h=habit({off:{[day(-2)]:FZ,[day(-1)]:FZ,[day(0)]:FZ}});unfreezeDay(h,day(-1));setAmt(h,day(-1),30);
    assert.equal(ok(h,day(-1)),true);assert.equal(dayPercent([h],day(-1),false),1)});
  test('undoing today, the newest frozen day, ends the freeze on yesterday (it is not filled in again)',()=>{
    const h=habit({off:{[day(-1)]:FZ,[day(0)]:FZ}});assert.equal(unfreezeDay(h,day(0)),true);
    assert.deepEqual(h.off,{[day(-1)]:FZE});assert.equal(isFrozenNow(h),false);assert.equal(extendFreeze(h),false)});
  test('undoing the end day of an ended freeze moves the end one day earlier (the freeze does not come back)',()=>{
    const h=habit({off:{[day(-3)]:FZ,[day(-2)]:FZ,[day(-1)]:FZE}});assert.equal(unfreezeDay(h,day(-1)),true);
    assert.deepEqual(h.off,{[day(-3)]:FZ,[day(-2)]:FZE});assert.equal(isFrozenNow(h),false);assert.equal(extendFreeze(h),false)});
  test('the only frozen day: undoing it leaves no freeze at all',()=>{
    const h=habit({off:{[day(0)]:FZ}});unfreezeDay(h,day(0));assert.deepEqual(h.off,{});assert.equal(freezeState(h).on,false)});
  test('a skipped or normal day cannot be "unfrozen"',()=>{
    const h=habit({off:{[day(-1)]:'Ill'}});assert.equal(unfreezeDay(h,day(-1)),false);assert.equal(h.off[day(-1)],'Ill');assert.equal(unfreezeDay(h,day(-2)),false)});
});

describe('minutes today (category card)',()=>{
  test('adds minutes and hours (x60), ignores other units, stop habits, and skipped or frozen habits',()=>{
    const a=logs(habit(),45,0),b=logs(habit({id:'b',type:'hour',goal:1,unit:'hr'}),1.5,0),c=logs(habit({id:'c',type:'pages',goal:10,unit:'pages'}),20,0),
      d=logs(habit({id:'d',stop:true,goal:60}),30,0),e=logs(habit({id:'e',off:{[day(0)]:FZ}}),30,0),f=logs(habit({id:'f'}),20,-1);
    assert.equal(minutesToday([a,b,c,d,e,f]),135)});
  test('nothing logged is 0, and the text switches to hours',()=>{
    assert.equal(minutesToday([habit()]),0);assert.equal(minText(0),'0 min');assert.equal(minText(45),'45 min');assert.equal(minText(60),'1 h');assert.equal(minText(95),'1 h 35 min')});
});

describe('category card totals (todayStats)',()=>{
  const mk=(id,o)=>habit({id,...o});
  test('only the kinds the category has are listed, in a fixed order',()=>{
    assert.deepEqual(todayStats([]),[]);
    assert.deepEqual(todayStats([logs(mk('a',{}),45,0)]),['45 min']);
    assert.deepEqual(todayStats([logs(mk('p',{type:'pages',unit:'pages',goal:10}),12,0)]),['12 pages'])});
  test('sums per unit: pages and chapters, problems solved and tried stay separate',()=>{
    const hs=[logs(mk('a',{type:'pages',unit:'pages',goal:10}),12,0),logs(mk('b',{type:'pages',unit:'pages',goal:10}),8,0),logs(mk('c',{type:'pages',unit:'chapters',goal:1}),2,0),
      logs(mk('d',{type:'problems',unit:'problems solved',goal:3}),5,0),logs(mk('e',{type:'problems',unit:'problems tried',goal:3}),9,0)];
    assert.deepEqual(todayStats(hs),['20 pages','2 chapters','5 problems solved','9 problems tried'])});
  test('a kind that exists shows 0 even if nothing is logged yet',()=>{
    assert.deepEqual(todayStats([mk('a',{type:'problems',unit:'problems solved',goal:3}),mk('t',{type:'times',unit:'times',goal:1})]),['0 problems solved','0 times'])});
  test('times add up, true/false habits count how many are done',()=>{
    const hs=[logs(mk('t',{type:'times',unit:'times',goal:1}),3,0),logs(mk('b1',{type:'bool',goal:1,unit:''}),1,0),mk('b2',{type:'bool',goal:1,unit:''})];
    assert.deepEqual(todayStats(hs),['3 times','1 done'])});
  test('stop habits: counts those logged within the limit; over the limit or not logged are not counted',()=>{
    const ok1=logs(mk('s1',{stop:true,goal:60}),30,0),over=logs(mk('s2',{stop:true,goal:60}),90,0),none=mk('s3',{stop:true,goal:60}),
      avoid=mk('s4',{type:'bool',stop:true,goal:1,unit:'',skip:{[day(0)]:1}});
    assert.deepEqual(todayStats([ok1,over,none,avoid]),['2 stopped']);
    assert.deepEqual(todayStats([ok1]),['1 stopped'])});   // stop habits are not minutes
  test('skipped and frozen habits are left out completely',()=>{
    assert.deepEqual(todayStats([logs(mk('a',{off:{[day(0)]:FZ}}),30,0),mk('p',{type:'pages',unit:'pages',goal:10,off:{[day(0)]:'Ill'}})]),[])});
  test('a unit with markup is escaped',()=>assert.deepEqual(todayStats([logs(mk('p',{type:'pages',unit:'<b>',goal:10}),2,0)]),['2 &lt;b&gt;']));
});

describe('goal history (gl): every day keeps the goal it had',()=>{
  // goal 10 until 5 days ago, 15 from 4 days ago on (h.goal is the goal of today)
  const mk=(o={})=>habit({goal:15,gl:{[day(-10)]:10,[day(-4)]:15},...o});
  test('goalOn is the newest entry on or before the day',()=>{
    const h=mk();
    assert.equal(goalOn(h,day(-10)),10);assert.equal(goalOn(h,day(-5)),10);
    assert.equal(goalOn(h,day(-4)),15);assert.equal(goalOn(h,day(0)),15);assert.equal(goalOn(h),15)});   // no day given = today
  test('days before the first entry use the first entry',()=>assert.equal(goalOn(habit({goal:20,gl:{[day(-3)]:12}}),day(-9)),12));
  test('with no history the one goal is used (old habits and old backups)',()=>{
    assert.equal(goalOn(habit({goal:30}),day(-2)),30);assert.equal(goalOn(habit({goal:30,gl:{}}),day(0)),30)});
  test('the same amount scores differently on days with different goals',()=>{
    const h=mk();
    near(pctOf(h,12,day(-6)),1.2);   // 12 of 10
    near(pctOf(h,12,day(-1)),.8);    // 12 of 15
    near(pctOf(h,12),.8)});          // no day given = today
  test('changing the goal later does not change earlier days',()=>{
    const h=habit({goal:10,gl:{[day(-10)]:10}});h.done[day(-3)]=12;
    near(pctOf(h,12,day(-3)),1.2);
    setGoal(h,20);
    near(pctOf(h,12,day(-3)),1.2);near(pctOf(h,12,day(0)),.6);assert.equal(h.goal,20)});
  test('setGoal can start on an earlier day, and later entries stay',()=>{
    const h=mk();setGoal(h,12,day(-7));
    assert.equal(goalOn(h,day(-8)),10);assert.equal(goalOn(h,day(-7)),12);assert.equal(goalOn(h,day(-5)),12);
    assert.equal(goalOn(h,day(-4)),15);assert.equal(h.goal,15)});
  test('setGoal on a habit with no history keeps the old goal for the past',()=>{
    const h=habit({goal:10});setGoal(h,25);
    assert.equal(goalOn(h,day(-5)),10);assert.equal(goalOn(h,day(0)),25);assert.deepEqual(goalHistory(h),[[day(-10),10],[day(0),25]])});
  test('typing in the goal box several times the same day keeps one entry for today',()=>{
    const h=habit({goal:10,gl:{[day(-10)]:10}});setGoal(h,1);setGoal(h,15);
    assert.deepEqual(goalHistory(h),[[day(-10),10],[day(0),15]])});
  test('a change back to the goal of the day before leaves no extra entry',()=>{
    const h=habit({goal:10,gl:{[day(-10)]:10}});setGoal(h,1);setGoal(h,10);
    assert.deepEqual(goalHistory(h),[[day(-10),10]])});
  test('a bad goal or date is refused and changes nothing',()=>{
    const h=habit({goal:10,gl:{[day(-10)]:10}});
    assert.equal(setGoal(h,0),false);assert.equal(setGoal(h,-3),false);assert.equal(setGoal(h,5,'nonsense'),false);
    assert.deepEqual(goalHistory(h),[[day(-10),10]]);assert.equal(h.goal,10)});
  test('a goal cannot start in the future',()=>{
    const h=habit({goal:10,gl:{[day(-10)]:10}});setGoal(h,50,day(5));
    assert.equal(goalOn(h,day(0)),50);assert.equal(goalHistory(h).length,2)});
  test('stop habits: the limit of each day decides the streak',()=>{
    // limit 60 until 3 days ago, then 20. 100 min is allowed (up to 200% of 60) in the past but not today.
    const h=habit({stop:true,goal:20,gl:{[day(-10)]:60,[day(-3)]:20}});
    logs(h,100,-5);logs(h,100,0);
    assert.equal(ok(h,day(-5)),true);assert.equal(ok(h,day(0)),false)});
  test('stop habits: the percentage uses the limit of that day',()=>{
    const h=habit({stop:true,goal:20,gl:{[day(-10)]:60,[day(-3)]:20}});
    near(pctOf(h,50,day(-5)),1);near(pctOf(h,50,day(0)),0)});   // 50 is under 60, but 2.5x the limit of 20
  test('the combined day percentage uses the goal of that day',()=>{
    const h=mk();logs(h,12,-6,-1);
    near(dayPercent([h],day(-6),false),1.2);near(dayPercent([h],day(-1),false),.8)});
  test('shortcuts and the percentage text use the goal of the day',()=>{
    const h=mk();
    assert.equal(shortAmt(h,1,day(-6)),10);assert.equal(shortAmt(h,1,day(0)),15);assert.equal(shortAmt(h,2,day(-6)),20);
    assert.equal(amtPct(h,17,day(0)),'113% of goal');assert.equal(amtPct(h,17,day(-6)),'170% of goal');
    assert.equal(amtFull(h,17,day(0)),'113% of goal (15 min)');assert.equal(goalVal(h,day(-6)),'10 min')});
  test('amtFull shows the limit wording for stop habits and nothing extra for true/false and text',()=>{
    assert.equal(amtFull(habit({stop:true,goal:60}),30,day(0)),'50% of limit (60 min)');
    assert.equal(amtFull(habit({type:'bool',goal:1,unit:''}),1,day(0)),'');
    assert.equal(amtFull(habit({type:'text',goal:100,unit:'%'}),80,day(0)),'80% score')});
  test('a unit with markup is escaped in goalVal',()=>assert.equal(goalVal(habit({unit:'<b>',goal:3}),day(0)),'3 &lt;b&gt;'));
  test('norm gives an old habit its first entry: its one goal is the goal of every past day',()=>{
    const h=habit({goal:30});delete h.gl;assert.equal(needsGoalLog(h),true);norm(h);
    assert.deepEqual(h.gl,{[day(-10)]:30});assert.equal(needsGoalLog(h),false);assert.equal(goalOn(h,day(-9)),30)});
  test('norm keeps an existing history untouched, and true/false and text habits get none',()=>{
    const h=habit({goal:15,gl:{[day(-10)]:10,[day(-4)]:15}});norm(h);assert.deepEqual(h.gl,{[day(-10)]:10,[day(-4)]:15});
    const b=habit({type:'bool',goal:1,unit:''});norm(b);assert.deepEqual(b.gl,{});assert.equal(needsGoalLog(b),false);
    const t=habit({type:'text',goal:100,unit:'%'});norm(t);assert.deepEqual(t.gl,{});assert.equal(needsGoalLog(t),false)});
  test('norm repairs a history that is not a map',()=>{const h=habit({goal:30,gl:[1,2]});norm(h);assert.deepEqual(h.gl,{[day(-10)]:30})});
  test('an entry moved earlier by logging a day before the start still covers it',()=>{
    const h=habit({goal:30,gl:{[day(-10)]:30}});setAmt(h,day(-14),20);   // created moves to day(-14)
    assert.equal(h.created,day(-14));assert.equal(goalOn(h,day(-14)),30)});
  test('import keeps valid history entries and drops bad ones',()=>{
    const c=cleanHabit({id:'x',name:'X',type:'num',goal:15,unit:'pages',created:day(-10),done:{},gl:{[day(-10)]:10,[day(-4)]:15,'nope':3,[day(-2)]:-1,[day(-1)]:'abc'}});
    assert.deepEqual(c.gl,{[day(-10)]:10,[day(-4)]:15})});
  test('import of an old backup (no history) works and gets its history from norm',()=>{
    const c=cleanHabit({id:'x',name:'X',type:'min',goal:30,created:day(-10),done:{}});
    assert.deepEqual(c.gl,{});norm(c);assert.deepEqual(c.gl,{[day(-10)]:30})});
  test('true/false and text habits ignore any history',()=>{
    assert.deepEqual(cleanHabit({id:'b',name:'B',type:'bool',goal:1,gl:{[day(-3)]:5}}).gl,{});
    assert.deepEqual(cleanHabit({id:'t',name:'T',type:'text',gl:{[day(-3)]:5}}).gl,{});
    near(pctOf(habit({type:'text',goal:100,unit:'%',gl:{[day(-3)]:5}}),80,day(0)),.8)});
  test('todayStats counts a stop habit with the limit of today',()=>{
    const h=logs(habit({stop:true,goal:20,gl:{[day(-10)]:60,[day(-3)]:20}}),30,0);
    assert.deepEqual(todayStats([h]),['0 stopped']);   // 30 is over today's limit of 20 -> not counted as stopped
    const g=logs(habit({stop:true,goal:60,gl:{[day(-10)]:20,[day(-3)]:60}}),30,0);
    assert.deepEqual(todayStats([g]),['1 stopped'])});
});
