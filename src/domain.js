export const CATEGORIES = ['Zdrowie', 'Konto', 'Duch'];
export const STORE_VERSION = 2;

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return localDateKey(date) === key ? date : null;
}

export function createEmptyStore() { return { schemaVersion: STORE_VERSION, days: {} }; }

export function validateGoals(goals) {
  if (!Array.isArray(goals) || goals.length !== 5) return 'Dodaj dokładnie 5 celów.';
  for (const goal of goals) {
    if (!goal || !String(goal.text ?? '').trim()) return 'Każdy cel musi mieć treść.';
    if (!CATEGORIES.includes(goal.category)) return 'Wybierz kategorię dla każdego celu.';
  }
  return null;
}

export function freezeDay(store, date, goals, now = new Date()) {
  if (!parseDateKey(date)) throw new Error('Nieprawidłowa data.');
  if (store.days[date]?.frozenAt) throw new Error('Ten dzień jest już zamrożony.');
  const error = validateGoals(goals);
  if (error) throw new Error(error);
  const frozen = goals.map((goal, index) => ({ id: goal.id || `${date}-${index + 1}`, text: String(goal.text).trim(), category: goal.category, done: Boolean(goal.done) }));
  return { ...store, days: { ...store.days, [date]: { date, frozenAt: now.toISOString(), goals: frozen } } };
}

export function tomorrowDateKey(today = localDateKey()) {
  const date = parseDateKey(today);
  if (!date) throw new Error('Nieprawidłowa data.');
  date.setDate(date.getDate() + 1);
  return localDateKey(date);
}

export function canPlanDate(date, today = localDateKey()) {
  return date === today || date === tomorrowDateKey(today);
}

export function saveTomorrowPlan(store, date, goals, today = localDateKey()) {
  if (date !== tomorrowDateKey(today)) throw new Error('Możesz zapisać plan tylko na jutro.');
  const error = validateGoals(goals);
  if (error) throw new Error(error);
  const previous = store.days[date];
  const scheduled = goals.map((goal, index) => ({
    id: previous?.goals?.[index]?.id || goal.id || `${date}-${index + 1}`,
    text: String(goal.text).trim(),
    category: goal.category,
    done: Boolean(previous?.goals?.[index]?.done)
  }));
  return { ...store, days: { ...store.days, [date]: { ...previous, date, frozenAt: null, goals: scheduled, manuallyWon: false } } };
}

export function activateScheduledDay(store, date, now = new Date()) {
  const scheduled = store.days[date];
  if (!scheduled || scheduled.frozenAt || scheduled.goals?.length !== 5) return store;
  return { ...store, days: { ...store.days, [date]: { ...scheduled, frozenAt: now.toISOString() } } };
}

export function markDayManuallyWon(store, date, today = localDateKey()) {
  const record = store.days[date];
  if (!parseDateKey(date) || date >= today) throw new Error('Możesz ręcznie wygrać tylko zakończony dzień.');
  if (!record?.frozenAt) throw new Error('Dzień musi mieć zapisany plan.');
  if (record.manuallyWon || record.goals.filter(goal => goal.done).length === 5) throw new Error('Ten dzień jest już wygrany.');
  return { ...store, days: { ...store.days, [date]: { ...record, manuallyWon: true } } };
}

export function setGoalDone(store, date, goalId, done) {
  const day = store.days[date];
  if (!day?.frozenAt) throw new Error('Najpierw zamroź dzień.');
  if (!day.goals.some(g => g.id === goalId)) throw new Error('Nie znaleziono celu.');
  return { ...store, days: { ...store.days, [date]: { ...day, goals: day.goals.map(g => g.id === goalId ? { ...g, done: Boolean(done) } : g) } } };
}

export function dayStatus(day, date, today = localDateKey()) {
  if (!day) return 'unset';
  if (!day.frozenAt) return 'unset';
  if (day.manuallyWon && date < today) return 'won';
  const count = day.goals.filter(g => g.done).length;
  if (count === 5) return 'won';
  return date < today ? 'lost' : 'active';
}

export function getStats(store, today = localDateKey()) {
  const todayDate = parseDateKey(today);
  const win = d => dayStatus(store.days[d], d, today) === 'won';
  const weekStart = new Date(todayDate); weekStart.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7));
  const weekKeys = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return localDateKey(d); });
  const monthPrefix = today.slice(0, 7);
  const monthWins = Object.keys(store.days).filter(d => d.startsWith(monthPrefix) && win(d)).length;
  let streak = 0;
  const cursor = new Date(todayDate);
  if (!win(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (win(localDateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return { streak, weekWins: weekKeys.filter(win).length, monthWins, weekKeys };
}
