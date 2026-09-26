const CONFIG_KEY = 'dailyWins:supabase-config';
let clientPromise;

export function getCloudConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); }
  catch { return null; }
}

export function saveCloudConfig(url, publishableKey) {
  const normalized = String(url).trim().replace(/\/+$/, '');
  const key = String(publishableKey).trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalized)) throw new Error('Wpisz adres projektu w formacie https://…supabase.co.');
  if (!key.startsWith('sb_publishable_') && !key.startsWith('eyJ')) throw new Error('Wklej klucz publishable z Supabase (zaczyna się od sb_publishable_).');
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ url: normalized, key }));
  clientPromise = undefined;
}

export async function getCloudClient() {
  const config = getCloudConfig();
  if (!config) return null;
  if (!clientPromise) clientPromise = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(({ createClient }) => createClient(config.url, config.key, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } }));
  return clientPromise;
}

export async function sendLoginLink(email, redirectTo) {
  const client = await getCloudClient();
  if (!client) throw new Error('Najpierw zapisz ustawienia Supabase.');
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

export async function setCloudPassword(password) {
  const client = await getCloudClient();
  if (!client) throw new Error('Najpierw zapisz ustawienia Supabase.');
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function signInWithCloudPassword(email, password) {
  const client = await getCloudClient();
  if (!client) throw new Error('Najpierw zapisz ustawienia Supabase.');
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function getCloudSession() {
  const client = await getCloudClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signOutCloud() {
  const client = await getCloudClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchCloudDays() {
  const client = await getCloudClient();
  const { data, error } = await client.from('daily_days').select('day_date, goals, frozen_at').order('day_date');
  if (error) throw error;
  return Object.fromEntries(data.map(row => [row.day_date, { date: row.day_date, goals: row.goals, frozenAt: row.frozen_at }]));
}

export async function saveCloudDay(day, userId) {
  const client = await getCloudClient();
  const { error } = await client.from('daily_days').upsert({ user_id: userId, day_date: day.date, goals: day.goals, frozen_at: day.frozenAt }, { onConflict: 'user_id,day_date' });
  if (error) throw error;
}
