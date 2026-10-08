import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyStore, freezeDay, saveTomorrowPlan, activateScheduledDay, setGoalDone, dayStatus, getStats, localDateKey, markDayManuallyWon, canPlanDate, tomorrowDateKey } from '../src/domain.js';
import { loadStore, migrateLegacy, persistStore, STORAGE_KEY } from '../src/storage.js';

const goals = Array.from({length:5},(_,i)=>({text:`Cel ${i+1}`,category:['Zdrowie','Konto','Duch'][i%3]}));
class MemoryStorage { values = new Map(); getItem(k){return this.values.get(k) ?? null;} setItem(k,v){this.values.set(k,String(v));} }

test('open saved records stay unset; freezing requires exactly five valid goals',()=>{
  const date='2026-09-26', open={date,frozenAt:null,goals:goals.slice(0,4)};
  assert.equal(dayStatus(open,date,'2026-09-27'),'unset');
  assert.throws(()=>freezeDay({days:{[date]:open}},date,goals.slice(0,4)),/dokładnie 5/);
  assert.throws(()=>freezeDay({days:{}},date,[...goals.slice(0,4),{text:'',category:'Duch'}]),/treść/);
  const store=freezeDay(createEmptyStore(),date,goals,new Date('2026-09-26T09:00:00Z'));
  assert.equal(store.days[date].goals.length,5);
});

test('a frozen day locks its goal definition and only completion changes',()=>{
  const date='2026-09-26'; const store=freezeDay(createEmptyStore(),date,goals);
  assert.throws(()=>freezeDay(store,date,goals),/już zamrożony/);
  const next=setGoalDone(store,date,store.days[date].goals[0].id,true);
  assert.equal(next.days[date].goals[0].done,true);
  assert.equal(store.days[date].goals[0].done,false);
});

test('planning is restricted to today and tomorrow, including month boundaries',()=>{
  const today='2026-09-30',tomorrow='2026-10-01';
  assert.equal(tomorrowDateKey(today),tomorrow);
  assert.equal(canPlanDate(today,today),true);
  assert.equal(canPlanDate(tomorrow,today),true);
  assert.equal(canPlanDate('2026-10-02',today),false);
  assert.throws(()=>saveTomorrowPlan(createEmptyStore(),'2026-10-02',goals,today),/tylko na jutro/);
});

test('tomorrow plan remains editable until the date begins, then activates as a normal day',()=>{
  const today='2026-09-30',tomorrow='2026-10-01';
  let store=saveTomorrowPlan(createEmptyStore(),tomorrow,goals,today);
  assert.equal(store.days[tomorrow].frozenAt,null);
  assert.equal(store.days[tomorrow].goals.length,5);
  const revised=saveTomorrowPlan(store,tomorrow,goals.map((g,i)=>({...g,text:`Nowy cel ${i+1}`})),today);
  assert.equal(revised.days[tomorrow].goals[0].text,'Nowy cel 1');
  assert.equal(store.days[tomorrow].goals[0].text,'Cel 1');
  const activated=activateScheduledDay(revised,tomorrow,new Date('2026-10-01T00:05:00'));
  assert.ok(activated.days[tomorrow].frozenAt);
  assert.equal(dayStatus(activated.days[tomorrow],tomorrow,tomorrow),'active');
  let completed=activated;
  for(const goal of activated.days[tomorrow].goals) completed=setGoalDone(completed,tomorrow,goal.id,true);
  assert.equal(dayStatus(completed.days[tomorrow],tomorrow,tomorrow),'won');
  assert.equal(dayStatus(undefined,tomorrow,tomorrow),'unset');
});

test('manual win only changes its flag and counts in history statistics',()=>{
  const date='2026-09-24',today='2026-09-26';
  let store=freezeDay(createEmptyStore(),date,goals);
  store=setGoalDone(store,date,store.days[date].goals[0].id,true);
  const goalsBefore=structuredClone(store.days[date].goals);
  const corrected=markDayManuallyWon(store,date,today);
  assert.equal(dayStatus(corrected.days[date],date,today),'won');
  assert.deepEqual(corrected.days[date].goals,goalsBefore);
  assert.equal(corrected.days[date].manuallyWon,true);
  assert.equal(getStats(corrected,today).monthWins,1);
  assert.throws(()=>markDayManuallyWon(corrected,date,today),/już wygrany/);
  assert.throws(()=>markDayManuallyWon(corrected,today,today),/zakończony/);
});

test('manual win is rejected for an unplanned past day',()=>{
  assert.throws(()=>markDayManuallyWon(createEmptyStore(),'2026-09-25','2026-09-26'),/zapisany plan/);
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

test('loading and persisting the current store keeps every existing day and goal',()=>{
  const storage=new MemoryStorage(),date='2026-09-24';
  const original={schemaVersion:2,days:{[date]:{date,frozenAt:'2026-09-24T10:00:00.000Z',goals:goals.map((g,i)=>({...g,id:`old-${i}`,done:i===1}))},'2026-09-25':{date:'2026-09-25',frozenAt:null,goals:[{id:'old-open',text:'Zachowany plan',category:'Duch',done:false}]}}};
  storage.setItem(STORAGE_KEY,JSON.stringify(original));
  const rawBefore=storage.getItem(STORAGE_KEY),loaded=loadStore(storage).store;
  assert.equal(storage.getItem(STORAGE_KEY),rawBefore);
  assert.deepEqual(loaded.days,original.days);
  const updated=markDayManuallyWon(loaded,date,'2026-09-26');
  persistStore(updated,storage);
  const reloaded=loadStore(storage).store;
  assert.deepEqual(reloaded.days[date].goals,original.days[date].goals);
  assert.deepEqual(reloaded.days['2026-09-25'].goals,original.days['2026-09-25'].goals);
  assert.equal(reloaded.days[date].manuallyWon,true);
});

test('legacy root arrays and malformed rows do not crash migration',()=>{
  const store=migrateLegacy([{date:'2026-09-24',goals:goals.map(g=>g.text)},{date:'nonsense',goals:[]}]);
  assert.equal(Object.keys(store.days).length,1);
  assert.equal(store.days['2026-09-24'].goals.length,5);
});
