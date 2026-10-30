// Unit tests for src/stats.js (no DOM, no Firebase). Run with:  npm test
// Dates are relative to today (day(0) = today) because the logic compares against the real current date.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {K,T,add} from '../src/util.js';
import {FZ,setGoal} from '../src/scoring.js';
import {monthBack,rangeDefault,checkRange,startOf,habitStats,habitRows,categoryStats,categoryRows,totalsOf,amt} from '../src/stats.js';

const day=n=>K(add(T(),n));
const habit=(o={})=>({id:'h1',name:'Test',type:'min',stop:false,goal:30,unit:'min',created:day(-10),done:{},skip:{},off:{},notes:{},...o});
const logs=(h,v,...offs)=>{offs.forEach(n=>{h.done[day(n)]=v});return h};
const labels=rows=>rows.map(r=>r[0]);
const val=(rows,l)=>rows.find(r=>r[0]===l)[1];

describe('ranges',()=>{
  test('monthBack keeps the day, or uses the last day of a shorter month',()=>{
    assert.equal(K(monthBack(new Date(2026,9,30))),'2026-09-30');
    assert.equal(K(monthBack(new Date(2026,2,31))),'2026-02-28');
    assert.equal(K(monthBack(new Date(2028,2,31))),'2028-02-29');
    assert.equal(K(monthBack(new Date(2026,0,15))),'2025-12-15')});
  test('default range starts one month back, or at the start when that is more recent',()=>{
    const today=new Date(2026,9,30);
    assert.deepEqual(rangeDefault('2026-01-01',today),{from:'2026-09-30',to:'2026-10-30'});
    assert.deepEqual(rangeDefault('2026-10-20',today),{from:'2026-10-20',to:'2026-10-30'});
    assert.deepEqual(rangeDefault('2026-09-30',today),{from:'2026-09-30',to:'2026-10-30'})});
  test('checkRange explains what is wrong',()=>{
    assert.equal(checkRange(day(-5),day(0)),'');
    assert.match(checkRange('',day(0)),/both dates/);
    assert.match(checkRange(day(-1),day(-5)),/after/);
    assert.match(checkRange(day(3),day(5)),/future/)});
  test('startOf is the earliest created day',()=>{
    assert.equal(startOf([habit({created:day(-3)}),habit({created:day(-8)})]),day(-8));
    assert.equal(startOf([]),day(0))});
});

describe('habitStats: amount habits',()=>{
  // today 30 (100%), yesterday 15 (50%), -2: 60 (200%), -3 deliberate zero, -4 skipped, -5 frozen, -6..-10 not logged
  const mk=()=>{const h=habit({off:{[day(-4)]:'Ill',[day(-5)]:FZ},skip:{[day(-3)]:1}});h.done[day(0)]=30;h.done[day(-1)]=15;h.done[day(-2)]=60;return h};
  test('counts every kind of day',()=>{
    const r=habitStats(mk(),day(-10),day(0));
    assert.equal(r.kind,'amount');
    assert.equal(r.days,10);assert.equal(r.frozen,1);assert.equal(r.skipped,1);
    assert.equal(r.logged,4);assert.equal(r.pos,3);assert.equal(r.zero,6);
    assert.equal(r.p50,3);assert.equal(r.p100,2);assert.equal(r.p200,1)});
  test('total, best day and longest streak',()=>{
    const r=habitStats(mk(),day(-10),day(0));
    assert.equal(r.sum,105);assert.equal(r.best,60);assert.equal(r.streak,3)});
  test('a smaller range only counts its own days',()=>{
    const r=habitStats(mk(),day(-2),day(-1));
    assert.equal(r.days,2);assert.equal(r.p200,1);assert.equal(r.sum,75)});
  test('days before the habit existed and in the future are never counted',()=>{
    const r=habitStats(mk(),day(-100),day(50));
    assert.equal(r.days,10);assert.equal(r.frozen,1)});
  test('today without a log is not a 0% day yet',()=>{
    const r=habitStats(habit({created:day(0)}),day(0),day(0));
    assert.equal(r.days,1);assert.equal(r.zero,0);assert.equal(r.logged,0)});
  test('rows: all thresholds, total, average, best day',()=>{
    const h=mk(),rows=habitRows(h,habitStats(h,day(-10),day(0)));
    assert.deepEqual(labels(rows),['Total days','Frozen days','Skipped days','Days checked','Days at 0%','Days above 0%','Days ≥ 50%','Days ≥ 100%','Days ≥ 200%','Total','Average per checked day','Best day','Longest streak']);
    assert.equal(val(rows,'Total'),'1 h 45 min');assert.equal(val(rows,'Average per checked day'),'35 min');assert.equal(val(rows,'Best day'),'1 h');
    assert.equal(val(rows,'Longest streak'),'3 days')});
  test('rows with no logged day show a dash instead of dividing by zero',()=>{
    const h=habit(),rows=habitRows(h,habitStats(h,day(-3),day(-1)));
    assert.equal(val(rows,'Average per checked day'),'–');assert.equal(val(rows,'Best day'),'–')});
  test('hours and other units are written in the habit\'s own unit',()=>{
    assert.equal(amt(habit({type:'hour',unit:'hr',goal:1}),1.5),'1 h 30 min');
    assert.equal(amt(habit({type:'pages',unit:'pages',goal:10}),12.34),'12.3 pages');
    assert.equal(amt(habit({type:'pages',unit:'<b>',goal:10}),2),'2 &lt;b&gt;')});
});

describe('habitStats: done / not done habits',()=>{
  const mk=()=>{const h=habit({type:'bool',unit:'',goal:1,created:day(-5),skip:{[day(-2)]:1}});h.done[day(0)]=1;h.done[day(-1)]=1;return h};
  test('done, missed and rate; no percentage thresholds',()=>{
    const h=mk(),r=habitStats(h,day(-5),day(0));
    assert.equal(r.kind,'bool');assert.equal(r.days,6);assert.equal(r.done,2);assert.equal(r.missed,4);
    const rows=habitRows(h,r);
    assert.deepEqual(labels(rows),['Total days','Frozen days','Skipped days','Days done','Days missed','Done rate','Longest streak']);
    assert.equal(val(rows,'Done rate'),'33%')});
  test('today not done yet is not a missed day',()=>{
    const r=habitStats(habit({type:'bool',unit:'',goal:1,created:day(0)}),day(0),day(0));
    assert.equal(r.missed,0);assert.equal(r.done,0)});
});

describe('habitStats: stop habits',()=>{
  test('amount stop habit: stopped, over the limit, at zero, used and saved',()=>{
    // limit 60: today not logged (pending), -1 30 min, -2 90 min (50%), -3 130 min (0%), -4 not logged (counts as stopped)
    const h=habit({stop:true,goal:60,created:day(-4)});logs(h,30,-1);logs(h,90,-2);logs(h,130,-3);
    const r=habitStats(h,day(-4),day(0));
    assert.equal(r.kind,'stop');assert.equal(r.days,5);assert.equal(r.counted,4);
    assert.equal(r.stopped,2);assert.equal(r.over,2);assert.equal(r.atZero,1);
    assert.equal(r.sum,250);assert.equal(r.saved,90);
    const rows=habitRows(h,r);
    assert.deepEqual(labels(rows),['Total days','Frozen days','Skipped days','Days logged','Days stopped','Days over the limit','Days at 0%','Total used','Average per day','Saved against the limit','Longest streak']);
    assert.equal(val(rows,'Total used'),'4 h 10 min');assert.equal(val(rows,'Average per day'),'1 h 3 min');assert.equal(val(rows,'Saved against the limit'),'1 h 30 min')});
  test('avoid-it habit: stopped and slipped, with no limit numbers',()=>{
    const h=habit({type:'bool',stop:true,unit:'',goal:1,created:day(-2)});logs(h,1,-1);
    const r=habitStats(h,day(-2),day(0));
    assert.equal(r.kind,'stopbool');assert.equal(r.stopped,1);assert.equal(r.over,1);
    const rows=habitRows(h,r);
    assert.deepEqual(labels(rows),['Total days','Frozen days','Skipped days','Days logged','Days stopped','Days slipped','Stop rate','Longest streak']);
    assert.equal(val(rows,'Stop rate'),'50%')});
});

describe('frozen days',()=>{
  test('frozen days are counted by themselves and never in any percentage',()=>{
    const h=habit({created:day(-3),off:{[day(-1)]:FZ,[day(-2)]:FZ}});h.done[day(0)]=30;
    const r=habitStats(h,day(-3),day(0));
    assert.equal(r.frozen,2);assert.equal(r.days,2);assert.equal(r.zero,1);assert.equal(r.pos,1)});
  test('a frozen day does not break the longest streak',()=>{
    const h=habit({created:day(-3),off:{[day(-1)]:FZ}});logs(h,30,0,-2,-3);
    assert.equal(habitStats(h,day(-3),day(0)).streak,3)});   // 0, (frozen), -2, -3: the frozen day neither breaks nor adds
});

describe('categoryStats',()=>{
  test('day counts use the combined percentage of each day',()=>{
    // 30-minute habit: today 60 (200%), yesterday 30 (100%), -2 nothing, -3 a deliberate zero
    const h=habit({created:day(-3),skip:{[day(-3)]:1}});logs(h,60,0);logs(h,30,-1);
    const r=categoryStats([h],day(-3),day(0));
    assert.equal(r.days,4);assert.equal(r.logged,3);assert.equal(r.zero,2);assert.equal(r.pos,2);assert.equal(r.p50,2);assert.equal(r.p100,2);assert.equal(r.p200,1)});
  test('mixed types are weighted by importance and each habit counts at most 200%',()=>{
    const a=habit({id:'a',created:day(-1),importance:3}),b=habit({id:'b',type:'pages',unit:'pages',goal:10,created:day(-1),importance:3});
    logs(a,600,0);logs(b,0.0001,0);   // a: 2000% (capped to 200%), b: ~0% -> (3*2+3*0)/6 = 100%
    const r=categoryStats([a,b],day(0),day(0));
    assert.equal(r.p100,1);assert.equal(r.p200,0);assert.equal(r.p50,1)});
  test('a day when every habit is frozen is a frozen day, not counted elsewhere',()=>{
    const a=habit({id:'a',created:day(-2),off:{[day(-1)]:FZ}}),b=habit({id:'b',created:day(-2),off:{[day(-1)]:FZ}});
    const r=categoryStats([a,b],day(-2),day(-1));
    assert.equal(r.frozen,1);assert.equal(r.days,1);assert.equal(r.frozenHabitDays,2)});
  test('one habit frozen and one active: not a frozen day, but it counts as a frozen habit-day',()=>{
    const a=habit({id:'a',created:day(-1),off:{[day(-1)]:FZ}}),b=habit({id:'b',created:day(-1)});logs(b,30,-1);
    const r=categoryStats([a,b],day(-1),day(-1));
    assert.equal(r.frozen,0);assert.equal(r.days,1);assert.equal(r.p100,1);assert.equal(r.frozenHabitDays,1)});
  test('every habit skipped (not frozen) is a skipped day',()=>{
    const a=habit({created:day(-1),off:{[day(-1)]:'Ill'}});
    const r=categoryStats([a],day(-1),day(-1));
    assert.equal(r.skipped,1);assert.equal(r.days,1);assert.equal(r.zero,0)});
  test('a past day with nothing logged is a 0% day, except for categories with only stop habits',()=>{
    const reg=habit({created:day(-2)}),stop=habit({id:'s',stop:true,goal:60,created:day(-2)});
    assert.equal(categoryStats([reg],day(-2),day(-1)).zero,2);
    assert.equal(categoryStats([stop],day(-2),day(-1)).zero,0)});
  test('habits that did not exist yet are left out of that day',()=>{
    const old=habit({id:'o',created:day(-3)}),young=habit({id:'y',created:day(-1)});logs(young,30,-1);
    const r=categoryStats([old,young],day(-3),day(0));
    assert.equal(r.days,4);assert.equal(r.pos,1)});
  test('empty category gives zeros and a dash',()=>{
    const r=categoryStats([],day(-5),day(0));
    assert.equal(r.days,0);assert.equal(val(categoryRows(r),'Totals'),'–')});
  test('rows: the frozen habit-days tile only appears when there is one',()=>{
    assert.equal(labels(categoryRows(categoryStats([habit()],day(-2),day(0)))).includes('Frozen habit-days'),false);
    const f=habit({off:{[day(-1)]:FZ}});
    assert.equal(labels(categoryRows(categoryStats([f],day(-2),day(0)))).includes('Frozen habit-days'),true)});
});

describe('category totals for mixed types',()=>{
  test('only the kinds the category has, in the Home order',()=>{
    const m=habit({id:'m',created:day(-1)}),hr=habit({id:'hr',type:'hour',unit:'hr',goal:1,created:day(-1)}),
      p=habit({id:'p',type:'pages',unit:'pages',goal:10,created:day(-1)}),ch=habit({id:'c',type:'pages',unit:'chapters',goal:1,created:day(-1)}),
      b=habit({id:'b',type:'bool',unit:'',goal:1,created:day(-1)}),s=habit({id:'s',stop:true,goal:60,created:day(-1)}),sb=habit({id:'sb',type:'bool',stop:true,unit:'',goal:1,created:day(-1)});
    logs(m,45,0,-1);logs(hr,1,0);logs(p,12,0);logs(p,8,-1);logs(ch,2,0);logs(b,1,0,-1);logs(s,30,0);logs(sb,1,-1);
    const hs=[m,hr,p,ch,b,s,sb];
    // stop habits: s stopped on both days (yesterday not logged counts as stopped); sb slipped yesterday and today is still pending -> 0
    const t=totalsOf(hs.map(h=>[h,habitStats(h,day(-1),day(0))]));
    assert.deepEqual(t,['2 h 30 min','20 pages','2 chapters','2 done','2 stopped'])});
  test('a category without stop or bool habits shows neither',()=>{
    const m=logs(habit({created:day(-1)}),30,0);
    assert.deepEqual(totalsOf([[m,habitStats(m,day(-1),day(0))]]),['30 min'])});
});

describe('totals use the goal each day had',()=>{
  test('days at or above 100% are counted against the goal of their own day',()=>{
    // goal 10 until 5 days ago, 20 from 4 days ago on; 15 min logged on -6 (150% of 10) and on -1 (75% of 20)
    const h=habit({goal:20,gl:{[day(-10)]:10,[day(-4)]:20}});logs(h,15,-6,-1);
    const r=habitStats(h,day(-10),day(0));
    assert.equal(r.p100,1);assert.equal(r.p50,2);assert.equal(r.p200,0);assert.equal(r.pos,2);assert.equal(r.sum,30)});
  test('changing the goal later does not change the counts of earlier days',()=>{
    const h=habit({goal:10,gl:{[day(-10)]:10}});logs(h,12,-5,-4,-3);
    const before=habitStats(h,day(-10),day(-1));
    setGoal(h,50);
    const after=habitStats(h,day(-10),day(-1));
    assert.deepEqual(after,before);assert.equal(after.p100,3)});
  test('a range that only covers days before a change uses the old goal',()=>{
    const h=habit({goal:20,gl:{[day(-10)]:10,[day(-4)]:20}});logs(h,12,-8,-2);
    assert.equal(habitStats(h,day(-9),day(-5)).p100,1);   // 12 of 10
    assert.equal(habitStats(h,day(-3),day(-1)).p100,0)});  // 12 of 20
  test('stop habits: saved against the limit adds up each day against its own limit',()=>{
    // limit 60 until 5 days ago, 30 from 4 days ago on. Used 40 on -6 (saved 20) and 25 on -2 (saved 5).
    const h=habit({stop:true,goal:30,gl:{[day(-10)]:60,[day(-4)]:30}});logs(h,40,-6);logs(h,25,-2);
    const r=habitStats(h,day(-7),day(-1));
    // days -7..-1: unlogged days save their whole limit (that is how the totals already worked): 60 + 20 + 60 + 30 + 30 + 5 + 30
    assert.equal(r.saved,60+20+60+30+30+5+30);
    // with one limit for every day (today's 30) the old code would have said 7 * 30 - 65 = 145: the history is what makes it 235
    assert.notEqual(r.saved,7*30-65)});
});
