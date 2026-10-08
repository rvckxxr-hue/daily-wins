# Daily Wins — architecture

## Current delivery

Static PWA hosted on GitHub Pages. `src/domain.js` owns date, status, freezing, completion, and statistics rules; `src/storage.js` owns versioned persistence and legacy import; `src/cloud.js` owns Supabase browser auth and data access; `src/app.js` renders views and routes user actions through the domain/storage boundary. Local storage remains the offline cache. Supabase configuration is stored per browser and requires the project URL and publishable key on each device.

## Data model

`{ schemaVersion: 2, days: { [YYYY-MM-DD]: { date, frozenAt, manuallyWon, goals: [{ id, text, category, done }] } } }`

Planning is limited to today and tomorrow. Today's plan freezes when saved; tomorrow's five-goal plan stays editable until the date begins, when it is activated and frozen. Existing partial records remain stored and are shown in history; the application no longer creates or edits partial plans. Once a day begins, goal identity, text, order, and category are immutable; only completion changes. A day is won at 5/5 or when a completed past day is manually marked won. Manual correction changes only `manuallyWon`; it never edits goal completion. A frozen past day below 5/5 is otherwise lost; a current day below 5/5 is in progress. A missing or partial day is unset, regardless of date. Dates are local calendar dates, with ISO date keys (not UTC timestamps), to avoid timezone rollover bugs.

## Persistence and migration

The stable key is `dailyWins`; schema upgrades never clear it. On first load, the importer checks known legacy keys (`dailyWinsV2`, `dailyWins_v2`, `dailyWinsV1`, `dailyWins_v1`, `daily-wins`, `dailyWinsData`) and common object/array day shapes. It preserves the source keys and stores a backup under `dailyWins:migration-backup:<key>` before importing. Invalid rows are skipped and reported in the UI. A future schema migration must be additive and retain a recoverable backup. Local storage is device-local; there is no cloud synchronization in this release.

## Supabase sync

`supabase/schema.sql` creates `daily_days`, enables RLS, and installs a trigger that validates goal rows, protects frozen goal definitions, and stores the manual-win flag in an additive column. Re-run this SQL file on an existing project to add the column without deleting rows. The browser supports Supabase Auth magic links and passwords. The browser only uses the publishable key; never ship a secret/service-role key. On first authenticated sync, local days missing in the cloud are uploaded; cloud rows win same-date conflicts, while a local pre-sync backup is preserved. Changed days are upserted, and the app refreshes from the cloud when it regains focus. Concurrent edits to the same completion state are last-write-wins; never change frozen definitions. For stricter atomic checkbox concurrency, add a narrowly scoped RPC before multi-user use.

## Hosting and security

GitHub Pages serves static assets over HTTPS. The service worker caches only the app shell; private data remains in browser local storage and is not put into Cache Storage. Supabase JS is loaded from jsDelivr only after a user configures a project. CSP should be supplied by the hosting layer where possible; the HTML avoids inline executable scripts. GitHub Pages is static hosting and cannot enforce authorization, so Supabase RLS is mandatory for cloud data.

## Verification

`npm test` exercises freezing, immutability, status boundaries, statistics, and legacy migration with Node's built-in test runner. `npm run check` performs JavaScript syntax checks. Push this repository to GitHub and enable Pages with GitHub Actions as the source; `.github/workflows/deploy.yml` publishes the static app from `main`. UI behavior should also be checked in iPhone Safari, including safe-area layout and Add to Home Screen; this workspace has no attached device/browser automation session.
