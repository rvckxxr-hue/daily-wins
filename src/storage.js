import { createEmptyStore, STORE_VERSION, CATEGORIES } from './domain.js';

export const STORAGE_KEY = 'dailyWins';
export const LEGACY_KEYS = ['dailyWinsV2', 'dailyWins_v2', 'dailyWinsV1', 'dailyWins_v1', 'daily-wins', 'dailyWinsData'];

function normalizeGoal(g, index, date) {
  if (typeof g === 'string') return { id: `${date}-${index}`, text: g.trim(), category: 'Zdrowie', done: false };
  if (!g || typeof g !== 'object') return null;
  const text = String(g.text ?? g.title ?? g.name ?? '').trim();
  if (!text) return null;
  const rawCategory = g.category ?? g.kategoria;
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : ({ health: 'Zdrowie', account: 'Konto', spirit: 'Duch' })[rawCategory] || 'Zdrowie';
  return { id: String(g.id ?? `${date}-${index + 1}`), text, category, done: Boolean(g.done ?? g.completed ?? g.complete ?? g.checked ?? g.wykonane) };
}

function normalizeDay(raw, date) {
  if (!raw || typeof raw !== 'object') return null;
  let goals = raw.goals ?? raw.tasks ?? raw.cele ?? raw.objectives;
  if (!Array.isArray(goals)) goals = ['goal1','goal2','goal3','goal4','goal5'].map(k => raw[k]).filter(Boolean);
  goals = goals.map((goal, index) => normalizeGoal(goal, index, date)).filter(Boolean).slice(0, 5);
  if (!goals.length) return null;
  const frozenFlag = raw.frozenAt || raw.frozen || raw.isFrozen || goals.length === 5;
  if (frozenFlag && goals.length === 5) return { date, frozenAt: typeof raw.frozenAt === 'string' ? raw.frozenAt : new Date().toISOString(), goals, manuallyWon: Boolean(raw.manuallyWon) };
  return { date, frozenAt: null, goals: goals.slice(0, 4), manuallyWon: Boolean(raw.manuallyWon) };
}

export function migrateLegacy(raw, now = new Date()) {
  const result = createEmptyStore();
  if (!raw || typeof raw !== 'object') return result;
  const source = Array.isArray(raw) ? raw : raw.days ?? raw.data ?? raw.entries ?? raw;
  const rows = Array.isArray(source) ? source.map(x => [x?.date ?? x?.day, x]) : Object.entries(source);
  for (const [date, day] of rows) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const normalized = normalizeDay(day, date);
    if (normalized) result.days[date] = normalized;
  }
  return result;
}

export function loadStore(storage = localStorage, now = new Date()) {
  const current = storage.getItem(STORAGE_KEY);
  if (current) {
    try {
      const parsed = JSON.parse(current);
      if (parsed?.schemaVersion > STORE_VERSION) {
        storage.setItem(`dailyWins:migration-backup:${STORAGE_KEY}:future-schema`, current);
        return { store: createEmptyStore(), migrated: null, warning: 'Dane pochodzą z nowszej wersji. Zapisano ich kopię bezpieczeństwa; ten build nie może ich bezpiecznie otworzyć.' };
      }
      if (parsed?.schemaVersion && parsed.schemaVersion < STORE_VERSION && parsed.days && typeof parsed.days === 'object') storage.setItem(`dailyWins:migration-backup:${STORAGE_KEY}:schema-${parsed.schemaVersion}`, current);
      if (parsed?.schemaVersion && parsed.schemaVersion <= STORE_VERSION && parsed.days && typeof parsed.days === 'object') return { store: { ...createEmptyStore(), ...parsed, schemaVersion: STORE_VERSION }, migrated: null };
      const store = migrateLegacy(parsed, now);
      storage.setItem(`dailyWins:migration-backup:${STORAGE_KEY}:legacy`, current);
      storage.setItem(STORAGE_KEY, JSON.stringify(store));
      return { store, migrated: STORAGE_KEY };
    }
    catch {
      storage.setItem(`dailyWins:migration-backup:${STORAGE_KEY}:invalid`, current);
      return { store: createEmptyStore(), migrated: null, warning: 'Nie udało się odczytać zapisu. Zachowano jego kopię bezpieczeństwa; bieżące zmiany zapiszą się osobno.' };
    }
  }
  for (const key of LEGACY_KEYS) {
    const value = storage.getItem(key);
    if (!value) continue;
    try {
      const store = migrateLegacy(JSON.parse(value), now);
      storage.setItem(`dailyWins:migration-backup:${key}`, value);
      storage.setItem(STORAGE_KEY, JSON.stringify(store));
      return { store, migrated: key };
    } catch { /* Keep trying other sources, without deleting any original key. */ }
  }
  const empty = createEmptyStore();
  if (!current) storage.setItem(STORAGE_KEY, JSON.stringify(empty));
  return { store: empty, migrated: null };
}

export function persistStore(store, storage = localStorage) { storage.setItem(STORAGE_KEY, JSON.stringify({ ...store, schemaVersion: STORE_VERSION })); }
