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

test('manual win action is only rendered for completed past losses and requires confirmation', () => {
  assert.match(app, /d\?\.frozenAt&&state\.selectedDate<localDateKey\(\)&&selectedStatus==='lost'/);
  assert.match(app, /window\.confirm\('Czy na pewno chcesz oznaczyć ten dzień jako wygrany\?'/);
});
