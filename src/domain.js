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

export function saveDraft(store, date, goals) {
  if (!parseDateKey(date)) throw new Error('Nieprawidłowa data.');
  if (store.days[date]?.frozenAt) throw new Error('Zamrożonego dnia nie można edytować.');
  if (!Array.isArray(goals) || goals.length > 4) throw new Error('Otwarty szkic może mieć maksymalnie 4 cele.');
  const draft = goals.map((g, i) => ({ id: g.id || `${date}-draft-${i}`, text: String(g.text || '').trim(), category: CATEGORIES.includes(g.category) ? g.category : 'Zdrowie', done: false })).filter(g => g.text);
  const days = { ...store.days };
  if (draft.length) days[date] = { date, frozenAt: null, goals: draft };
  else delete days[date];
  return { ...store, days };
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
