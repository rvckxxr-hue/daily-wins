
import { CATEGORIES, MONTH_WIN_TARGET, WEEK_WIN_TARGET, activateScheduledDay, canPlanDate, createEmptyStore, dayStatus, freezeDay, getCategoryStats, getOverallStats, getStats, localDateKey, markDayManuallyWon, saveTomorrowPlan, setGoalDone, tomorrowDateKey } from './domain.js';
import { loadStore, persistStore } from './storage.js';
import { fetchCloudDays, getCloudClient, getCloudConfig, getCloudSession, saveCloudConfig, saveCloudDay, sendLoginLink, setCloudPassword, signInWithCloudPassword, signOutCloud } from './cloud.js';

const $ = (q, root = document) => root.querySelector(q);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const HELP_KEY = 'dailyWins:help-dismissed';
const PENDING_KEY = 'dailyWins:pending-cloud-dates';
const state = { ...loadStore(), view: 'today', planDate: localDateKey(), month: new Date(), selectedDate: null, notice: '', freezeQuote: false, cloudSession: null, cloudStatus: 'Lokal', cloudModal: false, showHelp: localStorage.getItem(HELP_KEY) !== 'true', offline: !navigator.onLine, syncTimer: null, syncing: null, pendingDates: readPendingDates(), lastSyncedAt: localStorage.getItem('dailyWins:last-synced-at') };
let lastRenderedDate=localDateKey();
const categories = CATEGORIES;
function readPendingDates(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]')}catch{return[]}}
function savePendingDates(){localStorage.setItem(PENDING_KEY,JSON.stringify([...new Set(state.pendingDates)]))}
function activateTodayPlan(){const today=localDateKey(),activated=activateScheduledDay(state.store,today);if(activated!==state.store){state.store=activated;persistStore(state.store);if(getCloudConfig()){state.pendingDates=[...new Set([...state.pendingDates,today])];savePendingDates();}}}
activateTodayPlan();
function update(mutator, {freezeQuote=false}={}) { try { if(state.readOnly) throw new Error('Ten zapis pochodzi z nowszej wersji aplikacji i jest tylko do odczytu.'); const previous=state.store; state.store = mutator(state.store); persistStore(state.store); state.notice = ''; state.freezeQuote=freezeQuote; const changed=Object.keys(state.store.days).filter(date=>JSON.stringify(previous.days[date])!==JSON.stringify(state.store.days[date])); if(changed.length&&getCloudConfig()) { state.pendingDates=[...new Set([...state.pendingDates,...changed])]; savePendingDates(); state.cloudStatus=state.offline?'Zapisano na tym urządzeniu · oczekuje na internet':'Zmiany zapisane · oczekuje na synchronizację'; } render(); if(state.cloudSession&&!state.offline) scheduleCloudSync(); } catch (error) { state.freezeQuote=false; state.notice = error.message; render(); } }
function day(date) { return state.store.days[date]; }
function countDone(d) { return d?.goals?.filter(g => g.done).length || 0; }
function statusLabel(s) { return ({unset:'Nieustalony',active:'W toku',won:'Wygrany',lost:'Niewygrany'})[s]; }
function dateLabel(key, options = { weekday:'long', day:'numeric', month:'long', year:'numeric' }) { const [y,m,d] = key.split('-').map(Number); return new Intl.DateTimeFormat('pl-PL', options).format(new Date(y,m-1,d)); }
function nav() { return `<nav class="nav" aria-label="Główna nawigacja">${[['today','Dzisiaj','⌂'],['planning','Planowanie','＋'],['history','Historia','▦'],['stats','Statystyki','↗']].map(([id,label,icon])=>`<button class="nav-item ${state.view===id?'selected':''}" data-view="${id}" ${state.view===id?'aria-current="page"':''}><span>${icon}</span>${label}</button>`).join('')}</nav>`; }
function cloudControl() { const label=state.cloudSession?(state.cloudStatus.startsWith('Zsynchronizowano')?'Chmura OK':state.cloudStatus.startsWith('Zapis lokalny')?'Błąd synchronizacji':state.cloudStatus):getCloudConfig()?'Zaloguj do chmury':'Połącz z chmurą'; return `<button class="cloud-control ${state.cloudSession?'connected':''}" data-action="cloud" aria-label="Ustawienia synchronizacji">${state.cloudSession?'<i></i>':''}<span>${esc(label)}</span></button>`; }
function cloudDialog() {
  if(!state.cloudModal)return '';
  const config=getCloudConfig();
  let content;
  if(!config||state.editCloudConfig) content=`<div class="eyebrow">SUPABASE</div><h2>Połącz z chmurą</h2><p>Adres projektu i klucz publishable znajdziesz w Supabase. Klucz publishable jest przeznaczony do aplikacji przeglądarkowych; dostęp do danych ogranicza logowanie i RLS.</p><form id="cloud-config-form"><label>Project URL<input name="url" type="url" required placeholder="https://….supabase.co" value="${esc(config?.url||'')}" autocomplete="url"></label><label>Publishable key<input name="key" required placeholder="sb_publishable_…" value="${esc(config?.key||'')}" autocomplete="off"></label><button class="button primary" type="submit">Zapisz ustawienia</button></form>`;
  else if(state.cloudSession) content=`<div class="eyebrow">SUPABASE</div><h2>Synchronizacja</h2><p>Zalogowano jako <strong>${esc(state.cloudSession.user.email||'użytkownik')}</strong>.</p><p class="cloud-status-line">${esc(state.cloudStatus)}</p><form id="cloud-password-form"><label>Ustaw hasło do logowania na innych urządzeniach<input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="Co najmniej 8 znaków"></label><label>Powtórz hasło<input name="confirmPassword" type="password" required minlength="8" autocomplete="new-password"></label><button class="button primary" type="submit">Ustaw hasło</button></form><div class="cloud-actions"><button class="button secondary" data-action="cloud-sync">Synchronizuj teraz</button><button class="button secondary" data-action="cloud-logout">Wyloguj</button></div>`;
  else content=`<div class="eyebrow">SUPABASE</div><h2>Zaloguj do Daily Wins</h2><p>Ustaw hasło w Safari, gdy jesteś zalogowany, a potem użyj go tutaj na iPhonie.</p><form id="cloud-login-form"><label>Adres e-mail<input name="email" type="email" required autocomplete="username" placeholder="ty@example.com"></label><label>Hasło<input name="password" type="password" required autocomplete="current-password"></label><button class="button primary" type="submit">Zaloguj hasłem</button></form><button class="text-button" data-action="magic-link-login">Zamiast tego wyślij link logowania</button><button class="text-button" data-action="edit-cloud-config">Zmień konfigurację projektu</button>`;
  return `<div class="modal-backdrop cloud-backdrop" data-close="true"><section class="modal cloud-modal" role="dialog" aria-modal="true" aria-label="Synchronizacja danych"><button class="close" data-close="true" aria-label="Zamknij">×</button>${content}</section></div>`;
}
function goalRow(goal, date, frozen) { return `<div class="goal ${goal.done?'is-done':''}"><span class="category-dot ${goal.category}"></span><span class="goal-text">${esc(goal.text)}</span><span class="pill ${goal.category}">${goal.category}</span>${frozen?`<label class="check"><input type="checkbox" data-done="${esc(goal.id)}" data-date="${date}" ${goal.done?'checked':''} aria-label="Oznacz ${esc(goal.text)} jako wykonany"><span></span></label>`:''}</div>`; }
function todayMetrics() {
  const stats=getStats(state.store), today=localDateKey(), monthDays=new Date(Number(today.slice(0,4)),Number(today.slice(5,7)),0).getDate();
  const bars=stats.weekKeys.map(date=>{const status=dayStatus(day(date),date,today);return `<i class="${status==='won'?'won':status==='lost'?'lost':''}" title="${esc(dateLabel(date,{weekday:'long',day:'numeric',month:'long'}))}: ${statusLabel(status)}"></i>`;}).join('');
  const remaining=Math.max(0,WEEK_WIN_TARGET-stats.weekWins), monthRemaining=Math.max(0,MONTH_WIN_TARGET-stats.monthWins), weekLabel=remaining===1?'wygrany dzień':remaining<=4?'wygrane dni':'wygranych dni';
  return `<section class="today-metrics" aria-label="Podsumowanie postępów"><article class="today-metric streak-metric"><span>AKTUALNA SERIA</span><strong>↗ ${stats.streak} <small>${stats.streak===1?'dzień':'dni'}</small></strong></article><article class="today-metric week-metric"><div class="metric-top"><span>TEN TYDZIEŃ</span><strong>${stats.weekWins}<small> / 7</small></strong></div><div class="mini-bars">${bars}</div><p>${remaining?`Jeszcze ${remaining} ${weekLabel} do celu 6/7`:'Cel 6/7 osiągnięty'}</p></article><article class="today-metric month-metric"><div class="metric-top"><span>TEN MIESIĄC</span><strong>${stats.monthWins}<small> / ${MONTH_WIN_TARGET}</small></strong></div><div class="progress"><span style="width:${Math.min(100,stats.monthWins/MONTH_WIN_TARGET*100)}%"></span></div><p>${monthRemaining?`Jeszcze ${monthRemaining} do celu · ${monthDays} dni w miesiącu`:`Cel ${MONTH_WIN_TARGET} osiągnięty · ${monthDays} dni w miesiącu`}</p></article></section>`;
}
function todayStreak() { const stats=getStats(state.store); return `<section class="today-streak" aria-label="Serie wygranych dni"><strong>🔥 ${stats.streak} ${stats.streak===1?'dzień':'dni'} z rzędu</strong><span>Rekord: ${stats.recordStreak} ${stats.recordStreak===1?'dzień':'dni'}</span></section>`; }
function todayView() {
  const today = localDateKey(), d = day(today), status = dayStatus(d, today), done = countDone(d);
  if (!d?.frozenAt) return `${todayStreak()}<section class="hero"><div class="eyebrow">${esc(dateLabel(today).toUpperCase())}</div><div class="hero-mark">5</div><h1>Jeszcze nie zaplanowano</h1><p>${d?.goals?.length ? `Masz zapisane ${d.goals.length}/5 celów. Możesz je uzupełnić w dowolnym momencie.` : 'Dodaj pięć celów na dziś, kiedy będziesz gotowy. Plan pozostaje otwarty do zapisania.'}</p><button class="button primary" data-action="plan-today">${d?.goals?.length?'Uzupełnij plan':'Zaplanuj dzisiaj'} <span>→</span></button></section>${todayMetrics()}`;
  const remainingGoals=5-done, remainingLabel=remainingGoals===1?'cel':[2,3,4].includes(remainingGoals)?'cele':'celów';
  const goalProgress=status==='won'?'<div class="goal-progress won">DZIEŃ WYGRANY</div>':status==='active'?`<div class="goal-progress"><strong>Jeszcze ${remainingGoals} ${remainingLabel} → WYGRANA</strong><span>Masz jeszcze czas.</span></div>`:'';
  return `${todayStreak()}<section class="today-head"><div><div class="eyebrow">${esc(dateLabel(today).toUpperCase())}</div><h1>Małe kroki.<br>Jeden mocny dzień.</h1></div><div class="score ${status==='won'?'score-won':''}"><strong>${done}<small>/5</small></strong><span>${status==='won'?'WYGRANY':status==='lost'?'ZAKOŃCZONY':'W TOKU'}</span></div></section>${goalProgress}<div class="progress"><span style="width:${done*20}%"></span></div><div class="goal-list">${d.goals.map(g=>goalRow(g,today,true)).join('')}</div><div class="lock-note">⌑ <span>Cele tego dnia są zamrożone. Odhaczaj wykonanie, gdy skończysz.</span></div>${status==='won'?'<div class="win-banner">✦ Dzień wygrany. Dobra robota.</div>':''}${todayMetrics()}`;
}
function firstUseHelp(){return state.showHelp?`<aside class="first-use-help"><button class="help-dismiss" data-action="dismiss-help" aria-label="Zamknij podpowiedź">×</button><strong>Jak działa Daily Wins?</strong><p><b>Dzisiaj</b> pokazuje bieżący dzień i pozwala odhaczać wykonane cele. W <b>Planowaniu</b> możesz ustawić dzisiaj lub jutro; plan na jutro pozostaje edytowalny do początku dnia.</p><button class="text-button" data-action="dismiss-help">Rozumiem</button></aside>`:''}
function planningView() {
  const today=localDateKey(), tomorrow=tomorrowDateKey(today);
  const date=canPlanDate(state.planDate,today)?state.planDate:today;
  const existing=day(date), isTomorrow=date===tomorrow, frozen=!isTomorrow&&Boolean(existing?.frozenAt), initial=existing?.goals||[];
  const slots = Array.from({length:5},(_,i)=>initial[i] || {text:'',category:'Zdrowie'});
  const filled=slots.filter(g=>g.text.trim()).length;
  const tabs=[['today',today,'Dzisiaj'],['tomorrow',tomorrow,'Jutro']].map(([id,d,label])=>`<button type="button" class="plan-day-tab ${date===d?'selected':''}" data-plan-date="${d}" aria-pressed="${date===d}"><span>${label}</span><small>${esc(dateLabel(d,{day:'numeric',month:'short'}))}</small></button>`).join('');
  return `<section class="section-head"><div class="eyebrow">DZIŚ I JUTRO</div><h1>Planowanie</h1><p>${isTomorrow?'Przygotuj plan na jutro. Możesz go edytować do początku tego dnia.':'Ustal pięć celów na dziś.'}</p></section><div class="plan-day-tabs" aria-label="Wybierz dzień">${tabs}</div><div class="planner"><div class="planner-top"><span class="field-label">DZIEŃ</span><strong class="planner-date">${esc(dateLabel(date,{weekday:'long',day:'numeric',month:'long'}))}</strong><span class="status ${frozen?'frozen':'open'}">${frozen?'Zamrożony':isTomorrow?'Edytowalny do jutra':'Otwarty plan'}</span></div>${state.freezeQuote&&date===today?'<p class="freeze-quote">Nie zmieniaj celu — zmieniaj swoją decyzję.</p>':''}${frozen?`<div class="goal-list">${existing.goals.map(g=>goalRow(g,date,true)).join('')}</div><div class="lock-note">Cele są zapisane. Odhaczaj wykonanie, gdy skończysz.</div>`:`<form id="plan-form" data-plan-date="${date}"><div class="form-goals">${slots.map((g,i)=>`<div class="form-row"><span class="number">Cel ${i+1}</span><input maxlength="120" name="text" placeholder="Wpisz swój cel" value="${esc(g.text)}" aria-label="Cel ${i+1}"><select name="category" aria-label="Kategoria celu ${i+1}">${categories.map(c=>`<option ${g.category===c?'selected':''}>${c}</option>`).join('')}</select></div>`).join('')}</div><div class="planner-bottom"><span id="goal-count" aria-live="polite">${filled}/5 celów</span><button class="button primary" type="submit">${isTomorrow?'Zapisz plan na jutro':'Zapisz i zamroź dzień'}</button></div></form><p class="fine-print">${isTomorrow?'Plan jutra można zmieniać do początku jutra.':'Po zapisaniu planu dzisiejszego cele zostaną zamrożone.'}</p>`}</div>`;
}
function historyView() {
  const month = state.month, first = new Date(month.getFullYear(),month.getMonth(),1), days = new Date(month.getFullYear(),month.getMonth()+1,0).getDate(), offset = (first.getDay()+6)%7;
  const cells = Array.from({length:offset},()=>'<span class="calendar-blank"></span>');
  for(let n=1;n<=days;n++){
    const date=localDateKey(new Date(month.getFullYear(),month.getMonth(),n)), record=day(date), s=dayStatus(record,date);
    const detail=record?.manuallyWon?'Ręcznie':record?.frozenAt?`${countDone(record)}/5`:record?`Plan ${record.goals.length}/5`:'';
    cells.push(`<button class="calendar-day ${s} ${date===localDateKey()?'is-today':''}" data-history-date="${date}" aria-label="${esc(dateLabel(date,{day:'numeric',month:'long'}))}: ${statusLabel(s)}${detail?`, ${detail}`:''}"><span class="day-num">${n}</span>${detail?`<small>${detail}</small>`:''}</button>`);
  }
  const d=state.selectedDate && day(state.selectedDate), selectedStatus=d&&dayStatus(d,state.selectedDate);
  const manualWinButton=d?.frozenAt&&state.selectedDate<localDateKey()&&selectedStatus==='lost'?`<button class="button primary" data-action="manual-win" data-date="${state.selectedDate}">Oznacz dzień jako wygrany</button>`:'';
  const popup=state.selectedDate?`<div class="modal-backdrop" data-close="true"><section class="modal" role="dialog" aria-modal="true" aria-label="Szczegóły dnia"><button class="close" data-close="true" aria-label="Zamknij">×</button><div class="eyebrow">ARCHIWUM</div><h2>${esc(dateLabel(state.selectedDate))}</h2><div class="status ${selectedStatus}">${statusLabel(selectedStatus)}${d?.frozenAt?` · ${d.manuallyWon?`ręcznie · `:''}${countDone(d)}/5`:''}</div>${d?.frozenAt?`<div class="goal-list">${d.goals.map(g=>goalRow(g,state.selectedDate,false)).join('')}</div>${manualWinButton}`:d?`<p>Ten dzień ma zachowany plan, który nie został zamrożony (${d.goals.length}/5).</p><div class="goal-list">${d.goals.map(g=>goalRow(g,state.selectedDate,false)).join('')}</div>`:'<p>Ten dzień nie ma ustalonego planu. Brak planu nie oznacza przegranej.</p>'}</section></div>`:'';
  return `<section class="section-head"><div class="eyebrow">TWOJA DROGA</div><h1>Historia</h1><p>Każdy dzień zostaje zapisany dokładnie takim, jaki był.</p></section><section class="calendar-card"><div class="month-nav"><button class="icon-button" data-month="-1" aria-label="Poprzedni miesiąc">←</button><h2>${new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric'}).format(month)}</h2><button class="icon-button" data-month="1" aria-label="Następny miesiąc">→</button></div><div class="weekdays">${['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div><div class="legend"><span><i class="legend-dot won"></i>Wygrany</span><span><i class="legend-dot active"></i>W toku</span><span><i class="legend-dot lost"></i>Niewygrany</span><span><i class="legend-dot unset"></i>Bez planu</span></div></section>${popup}`;
}
function statsView(){
  const s=getStats(state.store), all=getOverallStats(state.store), categories=getCategoryStats(state.store), today=localDateKey(), todayDone=countDone(day(today)), monthDays=new Date(Number(today.slice(0,4)),Number(today.slice(5,7)),0).getDate(), weekRemaining=Math.max(0,WEEK_WIN_TARGET-s.weekWins), monthRemaining=Math.max(0,MONTH_WIN_TARGET-s.monthWins);
  const statusClass=status=>status==='won'?'won':status==='lost'?'lost':status==='active'?'active':'unset';
  const recent=all.recentDays.map(({date,status})=>`<span class="recent-day ${statusClass(status)}" title="${esc(dateLabel(date,{weekday:'long',day:'numeric',month:'long'}))}: ${statusLabel(status)}" aria-label="${esc(dateLabel(date,{day:'numeric',month:'long'}))}: ${statusLabel(status)}"></span>`).join('');
  const todayText=s.todayStatus==='won'?'Wygrany':`${todayDone} / 5 wykonanych`;
  return `<section class="section-head"><div class="eyebrow">TWOJE WYNIKI</div><h1>Statystyki</h1></section><section class="stats-overview"><div class="all-time-result"><strong>${all.winPercent}%</strong><span>wygranych dni</span><p>${all.wins} z ${all.totalDays} dni</p></div><div class="overview-streak"><strong>🔥 Aktualna seria: ${s.streak} ${s.streak===1?'dzień':'dni'}</strong><span>🏆 Rekord: ${s.recordStreak} ${s.recordStreak===1?'dzień':'dni'}</span></div></section><section class="period-grid" aria-label="Wyniki okresów"><article class="period-card"><span>DZISIAJ</span><strong>${todayDone} / 5</strong><p class="${s.todayStatus==='won'?'period-won':''}">${todayText}</p></article><article class="period-card"><span>TEN TYDZIEŃ</span><strong>${s.weekWins} / 7</strong><p class="${s.weekWins>=WEEK_WIN_TARGET?'period-won':''}">${weekRemaining?`Jeszcze ${weekRemaining} do wygranej`:'Tydzień wygrany'}</p><div class="mini-bars">${s.weekKeys.map(d=>{const status=dayStatus(day(d),d);return `<i class="${statusClass(status)}" title="${esc(dateLabel(d,{weekday:'long',day:'numeric',month:'long'}))}: ${statusLabel(status)}"></i>`;}).join('')}</div></article><article class="period-card"><span>TEN MIESIĄC · ${monthDays} DNI</span><strong>${s.monthWins} / ${MONTH_WIN_TARGET}</strong><p class="${s.monthWins>=MONTH_WIN_TARGET?'period-won':''}">${monthRemaining?`Jeszcze ${monthRemaining} do wygranej`:'Miesiąc wygrany'}</p><small>${monthDays} dni kalendarzowych</small><div class="progress"><span style="width:${Math.min(100,s.monthWins/MONTH_WIN_TARGET*100)}%"></span></div></article></section><section class="execution-section"><div class="section-head"><div class="eyebrow">WYKONANIE CELÓW</div></div><div class="execution-total"><strong>${all.goalPercent}%</strong><span>${all.goalDone} / ${all.goalTotal} celów wykonanych</span></div><div class="category-list">${CATEGORIES.map(name=>{const stat=categories[name];return `<article class="category-row"><span class="category-dot ${name}"></span><h3>${name}</h3><strong>${stat.percent}%</strong><p>${stat.done} z ${stat.total} celów wykonanych</p></article>`;}).join('')}</div></section><section class="recent-section"><div class="section-head"><div class="eyebrow">OSTATNIE 30 DNI</div><h2>Ostatni miesiąc</h2></div><div class="recent-grid" aria-label="Status ostatnich 30 dni">${recent}</div><div class="recent-legend"><span><i class="won"></i>Wygrany</span><span><i class="lost"></i>Niewygrany</span><span><i class="active"></i>W toku</span><span><i class="unset"></i>Bez zapisu</span></div><p class="recent-count">${all.recentDays.filter(d=>d.status==='won').length} / 30 wygranych dni</p></section>`;
}
function setCloudLabel() { const span=$('.cloud-control span'); if(span) span.textContent=state.cloudSession?(state.cloudStatus.startsWith('Zsynchronizowano')?'Chmura OK':state.cloudStatus.startsWith('Zapis lokalny')?'Błąd synchronizacji':state.cloudStatus):(getCloudConfig()?'Zaloguj do chmury':'Połącz z chmurą'); }
function scheduleCloudSync(){clearTimeout(state.syncTimer);state.syncTimer=setTimeout(()=>syncCloud().catch(()=>{}),500)}
async function syncCloud() {
  if(state.syncing)return state.syncing;
  state.syncing=(async()=>{
  if(!getCloudConfig())throw new Error('Najpierw ustaw połączenie Supabase.');
  if(!navigator.onLine){state.offline=true;state.cloudStatus='Zapisano na tym urządzeniu · oczekuje na internet';setCloudLabel();render();return;}
  const session=await getCloudSession();
  if(!session){state.cloudSession=null;state.cloudStatus='Zaloguj do chmury';setCloudLabel();return;}
  state.cloudSession=session;state.cloudStatus='Synchronizuję…';setCloudLabel();
  const remoteDays=await fetchCloudDays(), localDays={...state.store.days};
  const backupKey=`dailyWins:supabase-pre-sync-backup:${new Date().toISOString().slice(0,10)}`;
  if(localStorage.getItem('dailyWins')&&!localStorage.getItem(backupKey))localStorage.setItem(backupKey,JSON.stringify(localDays));
  const pending=new Set(state.pendingDates), merged={...remoteDays};
  for(const [date,record] of Object.entries(localDays))if(pending.has(date)||!remoteDays[date]){await saveCloudDay(record,session.user.id);merged[date]=record;}
  state.pendingDates=state.pendingDates.filter(date=>JSON.stringify(state.store.days[date])!==JSON.stringify(localDays[date]));
  for(const date of state.pendingDates)if(state.store.days[date])merged[date]=state.store.days[date];
  savePendingDates();
  state.store={...state.store,days:merged};persistStore(state.store);
  state.offline=false;state.lastSyncedAt=new Date().toISOString();localStorage.setItem('dailyWins:last-synced-at',state.lastSyncedAt);state.cloudStatus=`Zsynchronizowano · ${Object.keys(merged).length} dni`;state.notice='';setCloudLabel();render();
  })();
  try{return await state.syncing;}catch(error){state.cloudStatus=navigator.onLine?'Błąd synchronizacji':'Zapisano na tym urządzeniu · oczekuje na internet';state.notice=navigator.onLine?`Dane są zapisane na tym urządzeniu, ale synchronizacja nie powiodła się: ${error.message}`:'Brak internetu. Zmiany są bezpiecznie zapisane na tym urządzeniu i zsynchronizują się automatycznie po połączeniu.';setCloudLabel();render();throw error;}finally{state.syncing=null;}
}
async function initializeCloud() {
  if(!getCloudConfig())return;
  if(!navigator.onLine){state.offline=true;state.cloudStatus='Offline · dane zapisują się na tym urządzeniu';setCloudLabel();render();return;}
  state.cloudStatus='Sprawdzam połączenie…';setCloudLabel();
  try { await getCloudClient();const session=await getCloudSession();if(session){state.cloudSession=session;await syncCloud();}else{state.cloudSession=null;state.cloudStatus='Zaloguj do chmury';setCloudLabel();} }
  catch(error){state.cloudSession=null;state.cloudStatus='Brak połączenia';state.notice=`Nie udało się połączyć z Supabase: ${error.message}`;setCloudLabel();render();}
}
function render(){ lastRenderedDate=localDateKey();const views={today:todayView,planning:planningView,history:historyView,stats:statsView}; const syncInfo=state.offline?'Offline · dane zapisują się na tym urządzeniu':state.cloudSession?(state.pendingDates.length?`${state.pendingDates.length} zmian oczekuje na synchronizację`:state.lastSyncedAt?`Ostatnia synchronizacja: ${new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit'}).format(new Date(state.lastSyncedAt))}`:'Synchronizacja aktywna'):''; $('#app').innerHTML=`<header class="topbar"><a href="#" class="brand" data-view="today"><span class="brand-mark">5</span><span>daily<span class="brand-light">wins</span></span></a><div class="topbar-right">${cloudControl()}<div class="top-date">${esc(dateLabel(localDateKey(),{weekday:'short',day:'numeric',month:'short'}))}</div></div></header>${syncInfo?`<div class="sync-info ${state.offline?'offline':''}" role="status">${esc(syncInfo)}</div>`:''}<div class="app-shell">${nav()}<main>${firstUseHelp()}${views[state.view]()}</main></div>${cloudDialog()}${state.notice?`<div class="toast" role="alert">${esc(state.notice)}</div>`:''}`; }

if (state.warning) { state.notice = state.warning; state.readOnly = state.warning.startsWith('Dane pochodzą z nowszej wersji'); }
else if (state.migrated) state.notice = 'Zaimportowano wcześniejsze dane. Oryginalny zapis został zachowany jako kopia.';
render();
document.addEventListener('click', e=>{
  const view=e.target.closest('[data-view]'); if(view){e.preventDefault();state.view=view.dataset.view;state.freezeQuote=false;state.selectedDate=null;render();return;}
  if(e.target.closest('[data-action="plan-today"]')){state.view='planning';state.planDate=localDateKey();render();return;}
  if(e.target.closest('[data-action="dismiss-help"]')){state.showHelp=false;localStorage.setItem(HELP_KEY,'true');render();return;}
  if(e.target.closest('[data-action="cloud"]')){state.cloudModal=true;render();return;}
  if(e.target.closest('[data-action="edit-cloud-config"]')){state.editCloudConfig=true;render();return;}
  if(e.target.closest('[data-action="cloud-sync"]')){syncCloud().catch(error=>{state.notice=error.message;render();});return;}
  if(e.target.closest('[data-action="cloud-logout"]')){signOutCloud().then(()=>{state.cloudSession=null;state.cloudStatus='Zaloguj do chmury';state.cloudModal=false;render();}).catch(error=>{state.notice=error.message;render();});return;}
  if(e.target.closest('[data-action="magic-link-login"]')){const email=$('#cloud-login-form')?.elements.email.value.trim();if(!email){state.notice='Najpierw wpisz adres e-mail.';render();return;}sendLoginLink(email,`${location.origin}${location.pathname}`).then(()=>{state.notice='Link logowania wysłany. Otwórz go w tej samej przeglądarce.';render();}).catch(error=>{state.notice=`Nie udało się wysłać linku: ${error.message}`;render();});return;}
  const manualWin=e.target.closest('[data-action="manual-win"]');if(manualWin){const date=manualWin.dataset.date;if(date<localDateKey()&&window.confirm('Czy na pewno chcesz oznaczyć ten dzień jako wygrany?'))update(store=>markDayManuallyWon(store,date));return;}
  const month=e.target.closest('[data-month]');if(month){state.month.setMonth(state.month.getMonth()+Number(month.dataset.month));render();return;}
  const hist=e.target.closest('[data-history-date]');if(hist){state.selectedDate=hist.dataset.historyDate;render();return;}
  const planDate=e.target.closest('.plan-day-tab[data-plan-date]');if(planDate&&canPlanDate(planDate.dataset.planDate)){state.planDate=planDate.dataset.planDate;render();return;}
  if(e.target.closest('.close[data-close="true"]') || e.target.matches('.modal-backdrop[data-close="true"]')){state.selectedDate=null;state.cloudModal=false;state.editCloudConfig=false;render();}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(state.cloudModal||state.selectedDate)){state.cloudModal=false;state.editCloudConfig=false;state.selectedDate=null;render();}});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-done]')) update(store=>setGoalDone(store,e.target.dataset.date,e.target.dataset.done,e.target.checked));
  if(e.target.closest('#plan-form')){const rows=[...$('#plan-form').querySelectorAll('.form-row')],count=rows.filter(r=>r.querySelector('[name=text]').value.trim()).length;$('#goal-count').textContent=`${count}/5 celów wpisanych${count===5?' · komplet':''}`;}
});
document.addEventListener('input',e=>{if(e.target.matches('#plan-form [name=text]')){const rows=[...$('#plan-form').querySelectorAll('.form-row')],count=rows.filter(r=>r.querySelector('[name=text]').value.trim()).length;$('#goal-count').textContent=`${count}/5 celów wpisanych${count===5?' · komplet':''}`;}});
document.addEventListener('submit',e=>{if(e.target.id!=='plan-form')return;e.preventDefault();const date=e.target.dataset.planDate,today=localDateKey(),rows=[...e.target.querySelectorAll('.form-row')],goals=rows.map(r=>({text:r.querySelector('[name=text]').value,category:r.querySelector('[name=category]').value}));if(!canPlanDate(date,today)){state.notice='Możesz planować tylko dzisiaj lub jutro.';render();return;}const freezeQuote=date===today;update(store=>date===tomorrowDateKey(today)?saveTomorrowPlan(store,date,goals,today):freezeDay(store,date,goals),{freezeQuote});});
document.addEventListener('submit',async e=>{
  if(e.target.id==='cloud-config-form'){
    e.preventDefault();const form=e.target;
    try{saveCloudConfig(form.elements.url.value,form.elements.key.value);state.editCloudConfig=false;state.cloudModal=false;state.notice='Połączenie zapisano na tym urządzeniu. Zaloguj się do synchronizacji.';render();await initializeCloud();}
    catch(error){state.notice=error.message;render();}return;
  }
  if(e.target.id==='cloud-login-form'){
    e.preventDefault();try{await signInWithCloudPassword(e.target.elements.email.value.trim(),e.target.elements.password.value);state.cloudModal=false;state.notice='Zalogowano. Łączę z chmurą…';render();await initializeCloud();}
    catch(error){state.notice=`Nie udało się zalogować: ${error.message}`;render();}
    return;
  }
  if(e.target.id==='cloud-password-form'){
    e.preventDefault();const password=e.target.elements.password.value;if(password!==e.target.elements.confirmPassword.value){state.notice='Hasła nie są takie same.';render();return;}
    try{await setCloudPassword(password);state.notice='Hasło ustawione. Teraz możesz zalogować się nim w aplikacji z ikony.';render();}
    catch(error){state.notice=`Nie udało się ustawić hasła: ${error.message}`;render();}
  }
});
window.addEventListener('focus',()=>{if(localDateKey()!==lastRenderedDate){state.planDate=localDateKey();activateTodayPlan();render();}else activateTodayPlan();if(state.cloudSession)syncCloud().catch(()=>{});});
function scheduleDayRollover(){const next=new Date();next.setHours(24,0,1,0);window.setTimeout(()=>{state.planDate=localDateKey();activateTodayPlan();render();if(state.cloudSession)syncCloud().catch(()=>{});scheduleDayRollover();},Math.max(1000,next-Date.now()));}
scheduleDayRollover();
window.addEventListener('online',()=>{state.offline=false;if(state.cloudSession)syncCloud().catch(()=>{});else initializeCloud().catch(()=>{});});
window.addEventListener('offline',()=>{state.offline=true;if(state.cloudSession){state.cloudStatus='Zapisano na tym urządzeniu · oczekuje na internet';setCloudLabel();render();}});
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
initializeCloud();
