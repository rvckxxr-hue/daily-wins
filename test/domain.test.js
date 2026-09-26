import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyStore, freezeDay, saveDraft, setGoalDone, dayStatus, getStats, localDateKey } from '../src/domain.js';
import { loadStore, migrateLegacy, STORAGE_KEY } from '../src/storage.js';

const goals = Array.from({length:5},(_,i)=>({text:`Cel ${i+1}`,category:['Zdrowie','Konto','Duch'][i%3]}));
class MemoryStorage { values = new Map(); getItem(k){return this.values.get(k) ?? null;} setItem(k,v){this.values.set(k,String(v));} }

test('open days stay unset; freezing requires exactly five valid goals',()=>{
  const date='2026-09-26'; let store=createEmptyStore();
  store=saveDraft(store,date,goals.slice(0,4));
  assert.equal(dayStatus(store.days[date],date,'2026-09-27'),'unset');
  assert.throws(()=>freezeDay(store,date,goals.slice(0,4)),/dokładnie 5/);
  assert.throws(()=>freezeDay(store,date,[...goals.slice(0,4),{text:'',category:'Duch'}]),/treść/);
  store=freezeDay(store,date,goals,new Date('2026-09-26T09:00:00Z'));
  assert.equal(store.days[date].goals.length,5);
});

test('a frozen day locks its goal definition and only completion changes',()=>{
  const date='2026-09-26'; const store=freezeDay(createEmptyStore(),date,goals);
  assert.throws(()=>saveDraft(store,date,[]),/zamrożonego/i);
  assert.throws(()=>freezeDay(store,date,goals),/już zamrożony/);
  const next=setGoalDone(store,date,store.days[date].goals[0].id,true);
  assert.equal(next.days[date].goals[0].done,true);
  assert.equal(store.days[date].goals[0].done,false);
});

test('status boundaries distinguish today, past and an unset past day',()=>{
  const date='2026-09-25', today='2026-09-26';
  const frozen=freezeDay(createEmptyStore(),date,goals);
  assert.equal(dayStatus(undefined,date,today),'unset');
  assert.equal(dayStatus(frozen.days[date],date,today),'lost');
  const won=freezeDay(createEmptyStore(),today,goals.map(g=>({...g,done:true})));
  assert.equal(dayStatus(won.days[today],today,today),'won');
  const active=freezeDay(createEmptyStore(),today,goals);
  assert.equal(dayStatus(active.days[today],today,today),'active');
});

test('weekly, monthly wins and streak metrics count only frozen wins',()=>{
  let store=createEmptyStore();
  for(const date of ['2026-09-21','2026-09-22','2026-09-24']) store=freezeDay(store,date,goals.map(g=>({...g,done:true})));
  store=freezeDay(store,'2026-09-23',goals);
  const stats=getStats(store,'2026-09-25');
  assert.equal(stats.weekWins,3);
  assert.equal(stats.monthWins,3);
  assert.equal(stats.streak,1);
  assert.equal(localDateKey(new Date(2026,8,26,23,59)),'2026-09-26');
});

test('legacy import retains source, makes recoverable backup, and leaves partial days open',()=>{
  const storage=new MemoryStorage();
  storage.setItem('dailyWinsV2',JSON.stringify({ '2026-09-24':{goals:goals.map((g,i)=>({...g,done:i<2}))}, '2026-09-25':{goals:[{text:'Szkic',category:'Duch'}]} }));
  const {store,migrated}=loadStore(storage);
  assert.equal(migrated,'dailyWinsV2');
  assert.equal(store.days['2026-09-24'].frozenAt!==null,true);
  assert.equal(store.days['2026-09-25'].frozenAt,null);
  assert.ok(storage.getItem('dailyWins:migration-backup:dailyWinsV2'));
  assert.ok(storage.getItem(STORAGE_KEY));
});

test('legacy root arrays and malformed rows do not crash migration',()=>{
  const store=migrateLegacy([{date:'2026-09-24',goals:goals.map(g=>g.text)},{date:'nonsense',goals:[]}]);
  assert.equal(Object.keys(store.days).length,1);
  assert.equal(store.days['2026-09-24'].goals.length,5);
});
