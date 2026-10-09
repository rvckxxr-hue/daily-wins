import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('planning presents only today and tomorrow and guards submitted dates', () => {
  assert.match(app, /\['today',today,'Dzisiaj'\],\['tomorrow',tomorrow,'Jutro'\]/);
  assert.match(app, /if\(!canPlanDate\(date,today\)\)/);
  assert.doesNotMatch(app, /data-planning-date|type="date"|plan-date-from-history/);
});

test('only day tabs handle plan-date clicks; goal fields do not trigger a view render', () => {
  assert.match(app, /e\.target\.closest\('\.plan-day-tab\[data-plan-date\]'\)/);
  assert.match(app, /<form id="plan-form" data-plan-date="\$\{date\}">/);
});

test('draft saving and draft-specific interface are removed while saved data stays in storage', async () => {
  assert.doesNotMatch(app, /saveDraft|save-draft|Zapisz szkic|szkic/i);
  assert.doesNotMatch(await readFile(new URL('../src/domain.js', import.meta.url), 'utf8'), /saveDraft/);
  assert.match(await readFile(new URL('../src/storage.js', import.meta.url), 'utf8'), /localStorage|STORAGE_KEY/);
});

test('goal fields use neutral placeholders', () => {
  assert.match(app, /placeholder="Wpisz swój cel"/);
  assert.doesNotMatch(app, /Najważniejszy cel dnia|Co jeszcze ma znaczenie|Rozwój osobisty/);
});

test('iOS text inputs use 16px and the viewport keeps user zoom enabled', () => {
  assert.match(css, /\.form-row input,\.form-row select,\.planner-top input,\.cloud-modal input\{font-size:16px\}/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?:[,"\s])/i);
});

test('statistics use equal desktop columns and one full-width mobile column', () => {
  assert.match(css, /\.stats-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);max-width:960px\}/);
  assert.match(css, /@media\(max-width:650px\)[\s\S]*?\.stats-grid\{grid-template-columns:minmax\(0,1fr\);max-width:none;gap:14px\}/);
  assert.match(css, /\.stat-card\.dark,\.stat-card\.month-card\{grid-column:auto\}/);
});

test('today and statistics show weekly, monthly, category progress and lost days', async () => {
  const domain = await readFile(new URL('../src/domain.js', import.meta.url), 'utf8');
  assert.match(app, /function todayMetrics\(\)/);
  assert.match(app, /Cel 6\/7 osiągnięty/);
  assert.match(app, /TEN MIESIĄC · \$\{monthDays\} DNI/);
  assert.match(app, /getCategoryStats\(state\.store\)/);
  assert.match(app, /\$\{stat\.done\} z \$\{stat\.total\} celów wykonanych/);
  assert.match(domain, /WEEK_WIN_TARGET = 6/);
  assert.match(domain, /MONTH_WIN_TARGET = 26/);
  assert.match(css, /\.mini-bars i\.lost\{background:#cc5b55\}/);
});

test('package 2 presents streak record, remaining goals, freeze quote and structured statistics', async () => {
  const domain = await readFile(new URL('../src/domain.js', import.meta.url), 'utf8');
  assert.match(domain, /recordStreak: getRecordStreak/);
  assert.match(domain, /export function getOverallStats/);
  assert.match(app, /🔥 \$\{stats\.streak\} .*Rekord: \$\{stats\.recordStreak\}/);
  assert.match(app, /Jeszcze \$\{remainingGoals\} \$\{remainingLabel\} → WYGRANA/);
  assert.match(app, /DZIEŃ WYGRANY/);
  assert.match(app, /Masz jeszcze czas\./);
  assert.match(app, /Nie zmieniaj celu — zmieniaj swoją decyzję\./);
  assert.match(app, /TWOJE WYNIKI/);
  assert.match(app, /WYKONANIE CELÓW/);
  assert.match(app, /OSTATNIE 30 DNI/);
  assert.match(app, /Bez zapisu/);
  assert.match(app, /\$\{all\.wins\} z \$\{all\.totalDays\} dni/);
  assert.match(app, /\$\{stat\.done\} z \$\{stat\.total\} celów/);
});

test('mobile plan text remains 16px and recent days have a compact responsive grid', () => {
  assert.match(css, /@media\(max-width:650px\)\{\.form-row input\{font-size:16px\}/);
  assert.match(css, /\.recent-grid\{display:grid;grid-template-columns:repeat\(10,minmax\(0,1fr\)\)/);
  assert.match(css, /\.recent-grid\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
});

test('manual win action is only rendered for completed past losses and requires confirmation', () => {
  assert.match(app, /d\?\.frozenAt&&state\.selectedDate<localDateKey\(\)&&selectedStatus==='lost'/);
  assert.match(app, /window\.confirm\('Czy na pewno chcesz oznaczyć ten dzień jako wygrany\?'/);
});
