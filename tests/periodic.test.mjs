// Unit tests for periodic habits (habits with a frequency label): the checked-day rule, the periodic stats,
// the "Periods only" merge, and the guarantee that periodic habits never change any daily number. No DOM, no Firebase.
// Dates are relative to today (day(0) = today) because the logic compares against the real current date.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {K,T,add} from '../src/util.js';
import {cleanFreq,isPeriodic,daily,periodic,freqText,isChecked,periodicChecked,periodsDay,countLabel,dayPercent,todayOf,todayStats,minutesToday,
  cleanHabit,norm,streak,FZ} from '../src/scoring.js';
import {habitStats,habitRows,categoryStats,categoryRows} from '../src/stats.js';
import {toHabit,diff,apply,rebase,HABIT_MAPS} from '../src/docs.js';

const day=n=>K(add(T(),n));
const habit=(o={})=>({id:'h1',name:'Test',type:'min',stop:false,goal:30,unit:'min',created:day(-10),done:{},skip:{},off:{},notes:{},...o});
const per=(o={})=>habit({id:'p1',fq:{n:3,per:'week'},...o});
const logs=(h,v,...offs)=>{offs.forEach(n=>{h.done[day(n)]=v});return h};
const labels=rows=>rows.map(r=>r[0]);
const val=(rows,l)=>rows.find(r=>r[0]===l)[1];
const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<eps,`expected ${a} to be close to ${b}`);

describe('the frequency label',()=>{
  test('cleanFreq accepts week, month and days, and rejects anything else',()=>{
    assert.deepEqual(cleanFreq({n:3,per:'week'}),{n:3,per:'week'});
    assert.deepEqual(cleanFreq({n:'2',per:'month'}),{n:2,per:'month'});
    assert.deepEqual(cleanFreq({n:10,per:'days'}),{n:10,per:'days'});
    for(const bad of [undefined,null,'week',{n:0,per:'week'},{n:-1,per:'week'},{n:100,per:'week'},{n:2,per:'year'},{n:'x',per:'days'},{per:'week'},[1,'week']])assert.equal(cleanFreq(bad),undefined)});
  test('a habit without the field is a daily habit',()=>{assert.equal(isPeriodic(habit()),false);assert.equal(freqText(habit()),'')});
  test('a habit with the field is periodic, a stop habit never is',()=>{
    assert.equal(isPeriodic(per()),true);
    assert.equal(isPeriodic(per({stop:true})),false);
    assert.equal(isPeriodic(habit({fq:{n:0,per:'week'}})),false)});
  test('freqText reads like a label',()=>{
    assert.equal(freqText(per({fq:{n:3,per:'week'}})),'3 times / week');
    assert.equal(freqText(per({fq:{n:1,per:'month'}})),'1 time / month');
    assert.equal(freqText(per({fq:{n:3,per:'days'}})),'every 3 days')});
  test('daily() and periodic() split a list',()=>{const a=habit(),b=per();
    assert.deepEqual(daily([a,b]),[a]);assert.deepEqual(periodic([a,b]),[b])});
  test('the frequency changes nothing: a periodic habit with a different label gets the same numbers',()=>{
    const a=logs(per({fq:{n:1,per:'week'}}),30,0,-3),b=logs(per({fq:{n:20,per:'month'}}),30,0,-3);
    assert.deepEqual(habitStats(a,day(-10),day(0)),habitStats(b,day(-10),day(0)))});
});

describe('the checked-day rule',()=>{
  test('a day is checked when something above 0 is logged',()=>{const h=logs(per(),5,-1);
    assert.equal(isChecked(h,day(-1)),true);assert.equal(isChecked(h,day(-2)),false)});
  test('a deliberate zero (skip marker) is not a check',()=>{const h=per();h.skip[day(-1)]=1;assert.equal(isChecked(h,day(-1)),false)});
  test('a skipped or frozen day is not a check',()=>{const h=logs(per(),5,-1,-2);h.off[day(-1)]='ill';h.off[day(-2)]=FZ;
    assert.equal(isChecked(h,day(-1)),false);assert.equal(isChecked(h,day(-2)),false)});
  test('periodicChecked lists only periodic habits checked that day, and not before they existed',()=>{
    const d=logs(habit({id:'d'}),30,-1),p=logs(per({id:'p'}),10,-1),q=per({id:'q'}),r=logs(per({id:'r',created:day(-1)}),10,-1);
    assert.deepEqual(periodicChecked([d,p,q,r],day(-1)).map(h=>h.id),['p','r']);
    assert.deepEqual(periodicChecked([d,p,q,r],day(-3)).map(h=>h.id),[])});
});

describe('periodic habits never change any daily number',()=>{
  const base=()=>{const d=logs(habit({id:'d'}),15,0,-1);d.done[day(-2)]=60;return d};
  test('dayPercent is the same with or without periodic habits',()=>{
    const d=base(),p=logs(per(),100,0,-1,-2,-3);
    for(const n of [0,-1,-2,-3,-4]){const k=day(n);assert.equal(dayPercent([d,p],k,n===0),dayPercent([d],k,n===0))}});
  test('a day with only periodic habits checked has no daily percentage (null)',()=>{
    const p=logs(per(),10,-1);assert.equal(dayPercent([p],day(-1),false),null)});
  test('an unchecked periodic day is never counted as a miss in a combined day',()=>{
    const d=logs(habit({id:'d'}),30,-1);assert.equal(dayPercent([d,per()],day(-1),false),dayPercent([d],day(-1),false))});
  test('today progress and the Home totals line ignore periodic habits',()=>{
    const d=logs(habit({id:'d'}),30,0),p=logs(per(),30,0);
    assert.deepEqual(todayOf([d,p]),todayOf([d]));assert.deepEqual(todayStats([d,p]),todayStats([d]));assert.equal(minutesToday([d,p]),minutesToday([d]));
    assert.deepEqual(todayOf([p]),{done:0,total:0})});
  test('category numbers keep their values for daily habits',()=>{
    const d=base(),p=logs(per(),100,0,-1,-2,-3,-4);
    const a=categoryStats([d],day(-10),day(0)),b=categoryStats([d,p],day(-10),day(0));
    for(const k of ['days','frozen','skipped','logged','zero','pos','p50','p100','p200','frozenHabitDays'])assert.equal(b[k],a[k],k);
    assert.deepEqual(b.totals,a.totals)});
  test('imported and stored habits keep the label, bad labels are dropped',()=>{
    assert.deepEqual(cleanHabit({id:'a',name:'x',type:'num',fq:{n:2,per:'week'}}).fq,{n:2,per:'week'});
    assert.equal(cleanHabit({id:'a',name:'x',type:'num',fq:{n:0,per:'week'}}).fq,undefined);
    assert.equal(cleanHabit({id:'a',name:'x',type:'num',stop:true,fq:{n:2,per:'week'}}).fq,undefined);
    assert.equal(cleanHabit({id:'a',name:'x',type:'num'}).fq,undefined)});
  test('norm removes a broken label and keeps a good one',()=>{
    const a=habit({fq:{n:2,per:'week'}});norm(a);assert.deepEqual(a.fq,{n:2,per:'week'});
    const b=habit({fq:'often'});norm(b);assert.equal('fq' in b,false)});
});

describe('stats of a periodic habit (only checked days count)',()=>{
  const R=(h,from=day(-10),to=day(0))=>habitStats(h,from,to);
  test('Number: unchecked days are not misses, not 0%, and there is no streak row',()=>{
    const h=logs(per(),30,-1,-4);const r=R(h),rows=habitRows(h,r);
    assert.equal(val(rows,'Days checked'),2);
    for(const l of ['Days missed','Days at 0%','Done rate','Longest streak','Days logged'])assert.ok(!labels(rows).includes(l),l);
    assert.deepEqual(labels(rows),['Total days','Frozen days','Skipped days','Days checked','Days above 0%','Days ≥ 50%','Days ≥ 100%','Days ≥ 200%','Total','Average per checked day','Best day'])});
  test('Number: thresholds, total, average and best use each day against its own goal',()=>{
    const h=per();h.done[day(-1)]=15;h.done[day(-2)]=30;h.done[day(-3)]=75;const rows=habitRows(h,R(h));
    assert.equal(val(rows,'Days checked'),3);assert.equal(val(rows,'Days above 0%'),3);assert.equal(val(rows,'Days ≥ 50%'),3);
    assert.equal(val(rows,'Days ≥ 100%'),2);assert.equal(val(rows,'Days ≥ 200%'),1);
    assert.equal(val(rows,'Total'),'2 h');assert.equal(val(rows,'Average per checked day'),'40 min');assert.equal(val(rows,'Best day'),'1 h 15 min')});
  test('Number: a habit with no checked day shows dashes, never 0%',()=>{const rows=habitRows(per(),R(per()));
    assert.equal(val(rows,'Days checked'),0);assert.equal(val(rows,'Average per checked day'),'–');assert.equal(val(rows,'Best day'),'–')});
  test('Total days, Frozen days and Skipped days work as usual',()=>{
    const h=logs(per({created:day(-5)}),30,-1);h.off[day(-2)]='ill';h.off[day(-3)]=FZ;const r=R(h);
    assert.equal(r.frozen,1);assert.equal(r.skipped,1);assert.equal(r.days,5);assert.equal(r.logged,1)});
  test('True / false: only Days done',()=>{
    const h=per({type:'bool',goal:1,unit:''});h.done[day(-1)]=1;h.done[day(-3)]=1;const rows=habitRows(h,R(h));
    assert.equal(val(rows,'Days done'),2);
    assert.deepEqual(labels(rows),['Total days','Frozen days','Skipped days','Days done'])});
  test('Text: logged, above 0%, 50, 100, average and best (no 0% row, no 200% row, no streak)',()=>{
    const h=per({type:'text',goal:100,unit:'%'});h.done[day(-1)]=40;h.done[day(-2)]=100;h.done[day(-3)]=70;const rows=habitRows(h,R(h));
    assert.deepEqual(labels(rows),['Total days','Frozen days','Skipped days','Days logged','Days above 0%','Days ≥ 50%','Days ≥ 100%','Average per logged day','Best day']);
    assert.equal(val(rows,'Days logged'),3);assert.equal(val(rows,'Days ≥ 50%'),2);assert.equal(val(rows,'Days ≥ 100%'),1);
    assert.equal(val(rows,'Average per logged day'),'70%');assert.equal(val(rows,'Best day'),'100%')});
  test('the date range limits the checked days',()=>{const h=logs(per(),30,0,-1,-8);
    assert.equal(R(h,day(-3),day(0)).logged,2);assert.equal(R(h,day(-10),day(0)).logged,3)});
  test('a daily habit keeps exactly its old rows',()=>{
    const h=logs(habit(),30,-1);const rows=habitRows(h,habitStats(h,day(-10),day(0)));
    assert.ok(labels(rows).includes('Days at 0%'));assert.ok(labels(rows).includes('Longest streak'))});
});

describe('category totals',()=>{
  test('Periodic checks counts the checked days of its periodic habits, and only appears when there is one',()=>{
    const d=logs(habit({id:'d'}),30,0),p=logs(per({id:'p'}),10,0,-1,-5),q=logs(per({id:'q',type:'bool',goal:1,unit:''}),1,-1);
    const r=categoryStats([d,p,q],day(-10),day(0));
    assert.equal(r.periodicChecks,4);assert.equal(val(categoryRows(r),'Periodic checks'),4);
    assert.ok(!labels(categoryRows(categoryStats([d],day(-10),day(0)))).includes('Periodic checks'))});
  test('Periodic checks follows the date range',()=>{const p=logs(per(),10,0,-1,-8);
    assert.equal(categoryStats([p],day(-3),day(0)).periodicChecks,2)});
});

describe('Periods only: the merged day',()=>{
  test('no periodic habit checked gives null (an empty cell, no number)',()=>{
    assert.equal(periodsDay([habit(),per()],day(-1)),null);
    assert.equal(periodsDay([logs(habit(),30,-1)],day(-1)),null)});
  test('one habit: its own percentage and a count of 1',()=>{
    const r=periodsDay([logs(per(),15,-1)],day(-1));assert.equal(r.n,1);near(r.p,.5)});
  test('several habits: average of the percentages weighted by importance',()=>{
    const a=logs(per({id:'a',importance:1}),30,-1),b=logs(per({id:'b',importance:3}),15,-1);   // 100% (w1) and 50% (w3)
    const r=periodsDay([a,b],day(-1));assert.equal(r.n,2);near(r.p,(1*1+3*.5)/4)});
  test('each habit is capped at 200%',()=>{
    const a=logs(per({id:'a',importance:3}),300,-1),b=logs(per({id:'b',importance:3}),30,-1);   // 1000% -> 200%, and 100%
    near(periodsDay([a,b],day(-1)).p,1.5)});
  test('True / false counts as 100% and Text as the typed percentage',()=>{
    const a=per({id:'a',type:'bool',goal:1,unit:''});a.done[day(-1)]=1;const b=per({id:'b',type:'text',goal:100,unit:'%'});b.done[day(-1)]=50;
    near(periodsDay([a,b],day(-1)).p,.75)});
  test('uses the goal of that day',()=>{const h=per({gl:{[day(-10)]:30,[day(-3)]:60}});h.done[day(-5)]=30;h.done[day(0)]=30;
    near(periodsDay([h],day(-5)).p,1);near(periodsDay([h],day(0)).p,.5)});
  test('skipped and frozen days, and daily habits, are left out',()=>{
    const a=logs(per({id:'a'}),30,-1);a.off[day(-1)]='ill';assert.equal(periodsDay([a],day(-1)),null);
    const d=logs(habit({id:'d'}),30,-1),b=logs(per({id:'b'}),30,-1);assert.equal(periodsDay([d,b],day(-1)).n,1)});
  test('countLabel writes 9+ for ten or more',()=>{assert.equal(countLabel(1),'1');assert.equal(countLabel(9),'9');assert.equal(countLabel(10),'9+');assert.equal(countLabel(25),'9+')});
});

describe('the cloud document (docs.js)',()=>{
  const doc=o=>({id:'p1',name:'Test',type:'num',goal:5,unit:'x',created:'2026-01-01',...o});
  test('toHabit keeps a valid label, removes a broken one, and old habits stay without it',()=>{
    assert.deepEqual(toHabit(doc({fq:{n:3,per:'week'}})).fq,{n:3,per:'week'});
    assert.equal('fq' in toHabit(doc({fq:{n:0,per:'week'}})),false);
    assert.equal('fq' in toHabit(doc({fq:'x'})),false);
    assert.equal('fq' in toHabit(doc({stop:true,fq:{n:2,per:'days'}})),false);
    assert.equal('fq' in toHabit(doc()),false)});
  test('the label is one field: setting it, changing it and removing it are single operations',()=>{
    const a=toHabit(doc()),b=toHabit(doc({fq:{n:3,per:'week'}})),c=toHabit(doc({fq:{n:4,per:'month'}}));
    assert.deepEqual(diff(a,b,HABIT_MAPS),[{path:['fq'],value:{n:3,per:'week'}}]);
    assert.deepEqual(diff(b,c,HABIT_MAPS),[{path:['fq'],value:{n:4,per:'month'}}]);
    assert.deepEqual(diff(b,a,HABIT_MAPS),[{path:['fq'],del:true}])});
  test('two devices: one sets the label, the other logs a day, and both edits survive',()=>{
    const base=toHabit(doc());
    const mine=apply(base,[{path:['fq'],value:{n:2,per:'week'}}],HABIT_MAPS);          // this device sets the label
    const remote=apply(base,[{path:['done','2026-02-01'],value:7}],HABIT_MAPS);          // another device logged a day
    const m=rebase(base,mine,remote,HABIT_MAPS);
    assert.deepEqual(m.fq,{n:2,per:'week'});assert.equal(m.done['2026-02-01'],7)});
  test('the same label written by two devices is not a conflict (key order does not matter)',()=>{
    const a=toHabit(doc({fq:{n:3,per:'week'}})),b=toHabit(doc({fq:{per:'week',n:3}}));assert.deepEqual(diff(a,b,HABIT_MAPS),[])});
});
