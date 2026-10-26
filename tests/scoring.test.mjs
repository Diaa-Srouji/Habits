// Unit tests for the pure habit logic in src/scoring.js (no DOM, no Firebase).
// Run with:  npm test   (uses Node's built-in test runner, nothing to install)
//
// Dates are written relative to today (day(0) = today, day(-1) = yesterday) because the
// scoring code always compares against the real current date.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {K,T,add} from '../src/util.js';
import {ok,streak,best,levelOf,dayScore,setAmt,norm,isOff} from '../src/scoring.js';

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
  test('over the limit is a failure',()=>assert.equal(ok(stop({done:{[day(-1)]:61}}),day(-1)),false));
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
  test('going over the limit resets the streak',()=>assert.equal(streak(stop({done:{[day(-2)]:100}})),1));
  test('going over the limit today means no streak',()=>assert.equal(streak(stop({done:{[day(0)]:100}})),5));
  test('true/false stop habit: a slip breaks the streak',()=>{
    const h=stop({type:'bool',goal:1,done:{[day(-3)]:1}});assert.equal(streak(h),2)});
  test('best: slip near the start leaves a longer later run',()=>assert.equal(best(stop({done:{[day(-4)]:100}})),3));
  test('best: slip in the middle splits the run in two',()=>assert.equal(best(stop({done:{[day(-3)]:100}})),2));
  test('skipped (off) days are bridged: day -1 and -3 count, -2 is skipped, the slip on -4 stops it',()=>{
    const h=stop({done:{[day(-4)]:100},off:{[day(-2)]:'Travel'}});assert.equal(streak(h),2)});
});

describe('levelOf: regular habits (goal 30)',()=>{
  const h=habit();
  test('nothing logged is level 0 (None)',()=>assert.equal(levelOf(h,0),0));
  test('under half the goal is 1 (Lowest)',()=>{assert.equal(levelOf(h,1),1);assert.equal(levelOf(h,14.9),1)});
  test('half the goal is 2 (Low)',()=>{assert.equal(levelOf(h,15),2);assert.equal(levelOf(h,29),2)});
  test('the goal is 3 (Normal)',()=>{assert.equal(levelOf(h,30),3);assert.equal(levelOf(h,44),3)});
  test('1.5x the goal is 4 (Better)',()=>{assert.equal(levelOf(h,45),4);assert.equal(levelOf(h,59),4)});
  test('2x the goal or more is 5 (Best)',()=>{assert.equal(levelOf(h,60),5);assert.equal(levelOf(h,500),5)});
  test('works with a fractional goal (1.5 hours)',()=>{const x=habit({type:'hour',goal:1.5});assert.equal(levelOf(x,1.5),3);assert.equal(levelOf(x,3),5)});
});

describe('levelOf: stop habits (limit 60)',()=>{
  const h=habit({stop:true,goal:60});
  test('none at all is 5 (Best)',()=>assert.equal(levelOf(h,0),5));
  test('up to half the limit is 4 (Better)',()=>{assert.equal(levelOf(h,30),4);assert.equal(levelOf(h,1),4)});
  test('up to the limit is 3 (Normal)',()=>{assert.equal(levelOf(h,31),3);assert.equal(levelOf(h,60),3)});
  test('up to 1.5x the limit is 2 (Low)',()=>{assert.equal(levelOf(h,61),2);assert.equal(levelOf(h,90),2)});
  test('up to 2x the limit is 1 (Lowest)',()=>{assert.equal(levelOf(h,91),1);assert.equal(levelOf(h,120),1)});
  test('more than 2x the limit is 0 (None)',()=>assert.equal(levelOf(h,121),0));
});

describe('levelOf: true/false habits',()=>{
  test('regular: done is 5, not done is 0',()=>{const h=habit({type:'bool',goal:1});assert.equal(levelOf(h,1),5);assert.equal(levelOf(h,0),0)});
  test('stop: avoided is 5, slipped is 0',()=>{const h=habit({type:'bool',goal:1,stop:true});assert.equal(levelOf(h,0),5);assert.equal(levelOf(h,1),0)});
});

describe('dayScore',()=>{
  test('regular: not logged is 0',()=>near(dayScore(habit(),0),0));
  test('regular: reaching the goal is a bit over half (0.575)',()=>near(dayScore(habit(),30),.575));
  test('regular: any amount scores above 0 and more scores higher',()=>{
    assert.ok(dayScore(habit(),1)>0);assert.ok(dayScore(habit(),45)>dayScore(habit(),30))});
  test('regular: 2x the goal is the maximum, more does not exceed 1',()=>{near(dayScore(habit(),60),1);near(dayScore(habit(),600),1)});
  test('stop: none is 1, the limit is 0.5, 2x the limit is 0',()=>{
    const h=habit({stop:true,goal:60});near(dayScore(h,0),1);near(dayScore(h,60),.5);near(dayScore(h,120),0)});
  test('stop: far over the limit stays at 0 (never negative)',()=>near(dayScore(habit({stop:true,goal:60}),999),0));
  test('true/false: done scores 0.9, not done 0',()=>{const h=habit({type:'bool',goal:1});near(dayScore(h,1),.9);near(dayScore(h,0),0)});
  test('true/false stop: avoided scores 0.9, slipped 0',()=>{const h=habit({type:'bool',goal:1,stop:true});near(dayScore(h,0),.9);near(dayScore(h,1),0)});
  test('every score stays between 0 and 1',()=>{
    for(const h of [habit(),habit({stop:true,goal:60}),habit({type:'bool',goal:1}),habit({type:'bool',goal:1,stop:true})])
      for(const v of [0,.5,1,15,30,60,120,1e6]){const s=dayScore(h,v);assert.ok(s>=0&&s<=1,`${h.type}/${h.stop}/${v} -> ${s}`)}});
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
