
import { CATEGORIES, createEmptyStore, dayStatus, freezeDay, getStats, localDateKey, saveDraft, setGoalDone } from './domain.js';
import { loadStore, persistStore } from './storage.js';
import { fetchCloudDays, getCloudClient, getCloudConfig, getCloudSession, saveCloudConfig, saveCloudDay, sendLoginLink, signOutCloud } from './cloud.js';

const $ = (q, root = document) => root.querySelector(q);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const HELP_KEY = 'dailyWins:help-dismissed';
const PENDING_KEY = 'dailyWins:pending-cloud-dates';
const state = { ...loadStore(), view: 'today', planDate: localDateKey(), month: new Date(), selectedDate: null, notice: '', cloudSession: null, cloudStatus: 'Lokal', cloudModal: false, showHelp: localStorage.getItem(HELP_KEY) !== 'true', offline: !navigator.onLine, syncTimer: null, syncing: null, pendingDates: readPendingDates(), lastSyncedAt: localStorage.getItem('dailyWins:last-synced-at') };
const categories = CATEGORIES;
function readPendingDates(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'[]')}catch{return[]}}
function savePendingDates(){localStorage.setItem(PENDING_KEY,JSON.stringify([...new Set(state.pendingDates)]))}
function update(mutator) { try { if(state.readOnly) throw new Error('Ten zapis pochodzi z nowszej wersji aplikacji i jest tylko do odczytu.'); const previous=state.store; state.store = mutator(state.store); persistStore(state.store); state.notice = ''; const changed=Object.keys(state.store.days).filter(date=>JSON.stringify(previous.days[date])!==JSON.stringify(state.store.days[date])); if(changed.length&&getCloudConfig()) { state.pendingDates=[...new Set([...state.pendingDates,...changed])]; savePendingDates(); state.cloudStatus=state.offline?'Zapisano na tym urządzeniu · oczekuje na internet':'Zmiany zapisane · oczekuje na synchronizację'; } render(); if(state.cloudSession&&!state.offline) scheduleCloudSync(); } catch (error) { state.notice = error.message; render(); } }
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
  else if(state.cloudSession) content=`<div class="eyebrow">SUPABASE</div><h2>Synchronizacja</h2><p>Zalogowano jako <strong>${esc(state.cloudSession.user.email||'użytkownik')}</strong>.</p><p class="cloud-status-line">${esc(state.cloudStatus)}</p><div class="cloud-actions"><button class="button secondary" data-action="cloud-sync">Synchronizuj teraz</button><button class="button secondary" data-action="cloud-logout">Wyloguj</button></div>`;
  else content=`<div class="eyebrow">SUPABASE</div><h2>Zaloguj do Daily Wins</h2><p>Wyślemy jednorazowy link logowania na Twój adres e-mail.</p><form id="cloud-login-form"><label>Adres e-mail<input name="email" type="email" required autocomplete="email" placeholder="ty@example.com"></label><button class="button primary" type="submit">Wyślij link logowania</button></form><button class="text-button" data-action="edit-cloud-config">Zmień konfigurację projektu</button>`;
  return `<div class="modal-backdrop cloud-backdrop" data-close="true"><section class="modal cloud-modal" role="dialog" aria-modal="true" aria-label="Synchronizacja danych"><button class="close" data-close="true" aria-label="Zamknij">×</button>${content}</section></div>`;
}
function goalRow(goal, date, frozen) { return `<div class="goal ${goal.done?'is-done':''}"><span class="category-dot ${goal.category}"></span><span class="goal-text">${esc(goal.text)}</span><span class="pill ${goal.category}">${goal.category}</span>${frozen?`<label class="check"><input type="checkbox" data-done="${esc(goal.id)}" data-date="${date}" ${goal.done?'checked':''} aria-label="Oznacz ${esc(goal.text)} jako wykonany"><span></span></label>`:''}</div>`; }
function todayView() {
  const today = localDateKey(), d = day(today), status = dayStatus(d, today), done = countDone(d);
  if (!d?.frozenAt) return `<section class="hero"><div class="eyebrow">${esc(dateLabel(today).toUpperCase())}</div><div class="hero-mark">5</div><h1>Jeszcze nie zaplanowano</h1><p>${d?.goals?.length ? `Masz szkic ${d.goals.length}/5 celów. Możesz go uzupełnić w dowolnym momencie.` : 'Dodaj pięć celów na dziś, kiedy będziesz gotowy. Plan pozostaje otwarty, dopóki go nie zamrozisz.'}</p><button class="button primary" data-action="plan-today">${d?.goals?.length?'Dokończ plan':'Zaplanuj dzisiaj'} <span>→</span></button></section>`;
  return `<section class="today-head"><div><div class="eyebrow">${esc(dateLabel(today).toUpperCase())}</div><h1>Małe kroki.<br>Jeden mocny dzień.</h1></div><div class="score ${status==='won'?'score-won':''}"><strong>${done}<small>/5</small></strong><span>${status==='won'?'WYGRANY':status==='lost'?'ZAKOŃCZONY':'W TOKU'}</span></div></section><div class="progress"><span style="width:${done*20}%"></span></div><div class="goal-list">${d.goals.map(g=>goalRow(g,today,true)).join('')}</div><div class="lock-note">⌑ <span>Cele tego dnia są zamrożone. Odhaczaj wykonanie, gdy skończysz.</span></div>${status==='won'?'<div class="win-banner">✦ Dzień wygrany. Dobra robota.</div>':''}`;
}
function firstUseHelp(){return state.showHelp?`<aside class="first-use-help"><button class="help-dismiss" data-action="dismiss-help" aria-label="Zamknij podpowiedź">×</button><strong>Jak działa Daily Wins?</strong><p><b>Dzisiaj</b> pokazuje bieżący dzień i pozwala odhaczać wykonane cele. W <b>Planowaniu</b> wpisujesz pięć celów; zapisanie kompletu zamraża ich treść.</p><button class="text-button" data-action="dismiss-help">Rozumiem</button></aside>`:''}
function planningView() {
  const date = state.planDate, existing = day(date), frozen = Boolean(existing?.frozenAt), initial = existing?.goals || [];
  const slots = Array.from({length:5},(_,i)=>initial[i] || {text:'',category:'Zdrowie'});
  const today=localDateKey(), start=new Date(`${today}T12:00:00`), upcoming=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);return localDateKey(d);});
  const futureSaved=Object.keys(state.store.days).filter(d=>d>upcoming[upcoming.length-1]).sort();
  const weekTiles=upcoming.map(d=>{const record=day(d),s=dayStatus(record,d),draft=Boolean(record&&!record.frozenAt),number=Number(d.slice(-2)),weekday=dateLabel(d,{weekday:'short'}).replace('.','');const detail=draft?`${record.goals.length}/5`:record?.frozenAt?`${countDone(record)}/5`:'';return `<button type="button" class="week-tile ${draft?'draft':s} ${d===date?'selected':''}" data-planning-date="${d}" aria-label="${esc(dateLabel(d,{weekday:'long',day:'numeric',month:'long'}))}: ${draft?`szkic ${detail}`:record?.frozenAt?`${statusLabel(s)}, ${detail}`:'nieustalony'}"><span>${esc(weekday)}</span><strong>${number}</strong><i></i>${detail?`<small>${detail}</small>`:''}</button>`;}).join('');
  const filled=slots.filter(g=>g.text.trim()).length;
  return `<section class="section-head"><div class="eyebrow">PLAN DNIA Z WYPRZEDZENIEM</div><h1>Planowanie</h1><p>Wybierz dzień, przygotuj pięć celów i zamroź plan, gdy będzie gotowy.</p></section><section class="week-picker"><div class="week-picker-head"><strong>Najbliższe dni</strong><span>Wybierz datę</span></div><div class="week-tiles">${weekTiles}</div></section><div class="planner"><div class="planner-top"><label class="field-label" for="plan-date">DZIEŃ</label><input id="plan-date" type="date" value="${date}" ${frozen?'disabled':''}><span class="status ${frozen?'frozen':'open'}">${frozen?'Zamrożony':existing?'Szkic':'Otwarty plan'}</span></div>${frozen?`<div class="goal-list">${existing.goals.map(g=>goalRow(g,date,true)).join('')}</div><div class="lock-note">Cele zostały zapisane i są niezmienne. Możesz zmieniać tylko wykonanie.</div>`:`<form id="plan-form"><div class="form-goals">${slots.map((g,i)=>`<div class="form-row"><span class="number">0${i+1}</span><input maxlength="120" name="text" placeholder="${['Najważniejszy cel dnia','Ruch i energia','Praca lub finanse','Rozwój osobisty','Co jeszcze ma znaczenie?'][i]}" value="${esc(g.text)}" aria-label="Cel ${i+1}"><select name="category" aria-label="Kategoria celu ${i+1}">${categories.map(c=>`<option ${g.category===c?'selected':''}>${c}</option>`).join('')}</select></div>`).join('')}</div><div class="planner-bottom"><span id="goal-count" aria-live="polite">${filled}/5 celów wpisanych${filled===5?' · gotowe do zamrożenia':''}</span><div class="plan-actions"><button class="button secondary" type="button" data-action="save-draft">Zapisz szkic</button><button class="button primary" type="submit">Zapisz i zamroź <span>→</span></button></div></div></form><p class="fine-print">Wpisz pięć celów. Po ich zapisaniu treść zostanie zamrożona — później będzie można tylko odhaczać wykonanie.</p>`}</div>`;
}
function historyView() {
  const month = state.month, first = new Date(month.getFullYear(),month.getMonth(),1), days = new Date(month.getFullYear(),month.getMonth()+1,0).getDate(), offset = (first.getDay()+6)%7;
  const cells = Array.from({length:offset},()=>'<span class="calendar-blank"></span>');
  for(let n=1;n<=days;n++){const date=localDateKey(new Date(month.getFullYear(),month.getMonth(),n)); const record=day(date),s=dayStatus(record,date); const detail=record?.frozenAt?`${countDone(record)}/5`:record?`Szkic ${record.goals.length}/5`:''; cells.push(`<button class="calendar-day ${s} ${date===localDateKey()?'is-today':''}" data-history-date="${date}" aria-label="${esc(dateLabel(date,{day:'numeric',month:'long'}))}: ${statusLabel(s)}${detail?`, ${detail}`:''}"><span class="day-num">${n}</span>${detail?`<small>${detail}</small>`:''}</button>`);}
  const d=state.selectedDate && day(state.selectedDate); const popup=state.selectedDate?`<div class="modal-backdrop" data-close="true"><section class="modal" role="dialog" aria-modal="true" aria-label="Szczegóły dnia"><button class="close" data-close="true" aria-label="Zamknij">×</button><div class="eyebrow">ARCHIWUM</div><h2>${esc(dateLabel(state.selectedDate))}</h2><div class="status ${dayStatus(d,state.selectedDate)}">${d&&!d.frozenAt?'Szkic':statusLabel(dayStatus(d,state.selectedDate))}${d?.frozenAt?` · ${countDone(d)}/5`:''}</div>${d?.frozenAt?`<div class="goal-list">${d.goals.map(g=>goalRow(g,state.selectedDate,false)).join('')}</div>`:d&&!d.frozenAt?`<p>Ten dzień ma otwarty szkic (${d.goals.length}/5). Treść nie jest jeszcze zamrożona.</p><button class="button primary" data-action="plan-date-from-history" data-date="${state.selectedDate}">Otwórz w Planowaniu →</button>`:`<p>Ten dzień nie ma ustalonego planu. Brak planu nie oznacza przegranej.</p>${state.selectedDate>=localDateKey()?`<button class="button primary" data-action="plan-date-from-history" data-date="${state.selectedDate}">Zaplanuj ten dzień →</button>`:''}`}</section></div>`:'';
  return `<section class="section-head"><div class="eyebrow">TWOJA DROGA</div><h1>Historia</h1><p>Każdy dzień zostaje zapisany dokładnie takim, jaki był.</p></section><section class="calendar-card"><div class="month-nav"><button class="icon-button" data-month="-1" aria-label="Poprzedni miesiąc">←</button><h2>${new Intl.DateTimeFormat('pl-PL',{month:'long',year:'numeric'}).format(month)}</h2><button class="icon-button" data-month="1" aria-label="Następny miesiąc">→</button></div><div class="weekdays">${['Pn','Wt','Śr','Cz','Pt','So','Nd'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div><div class="legend"><span><i class="legend-dot won"></i>Wygrany</span><span><i class="legend-dot active"></i>W toku</span><span><i class="legend-dot lost"></i>Niewygrany</span><span><i class="legend-dot unset"></i>Bez planu</span></div></section>${popup}`;
}
function statsView(){ const s=getStats(state.store), target=26, pct=Math.min(100,s.monthWins/target*100); return `<section class="section-head"><div class="eyebrow">KONSEKWENCJA W CZASIE</div><h1>Statystyki</h1><p>Wynik buduje się dzień po dniu. Dni bez planu nie są liczone jako przegrane.</p></section><div class="stats-grid"><article class="stat-card dark"><span class="stat-icon">↗</span><span class="stat-label">AKTUALNA SERIA</span><strong>${s.streak}<small> dni</small></strong><p>Wygrane dni z rzędu (każdy to 5/5).</p><details><summary>Jak liczymy?</summary><p>Seria pokazuje kolejne zamrożone dni zakończone wynikiem 5/5. Dzień bez planu nie jest przegraną, ale nie dodaje wygranej do serii.</p></details></article><article class="stat-card"><span class="stat-icon">▦</span><span class="stat-label">TEN TYDZIEŃ</span><strong>${s.weekWins}<small> / 7</small></strong><p>Liczba wygranych dni od poniedziałku do niedzieli.</p><div class="mini-bars">${s.weekKeys.map(d=>`<i class="${dayStatus(day(d),d)==='won'?'filled':''}" title="${esc(dateLabel(d,{weekday:'long',day:'numeric',month:'long'}))}: ${statusLabel(dayStatus(day(d),d))}"></i>`).join('')}</div><details><summary>Jak liczymy?</summary><p>Każdy z siedmiu dni tygodnia liczy się jako wygrany tylko po odhaczeniu wszystkich pięciu celów.</p></details></article><article class="stat-card month-card"><span class="stat-icon">✦</span><span class="stat-label">TEN MIESIĄC</span><strong>${s.monthWins}<small> / 26</small></strong><p>Wygrane dni w tym miesiącu wobec celu 26.</p><div class="progress"><span style="width:${pct}%"></span></div><div class="stat-foot">${s.monthWins>=26?'Cel osiągnięty.':`Jeszcze ${26-s.monthWins} ${26-s.monthWins===1?'dzień':'dni'} do celu`}</div><details><summary>Jak liczymy?</summary><p>Do celu wliczają się tylko dni z zamrożonym planem i wynikiem 5/5. Dni bez planu pomijamy.</p></details></article></div>`; }
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
function render(){ const views={today:todayView,planning:planningView,history:historyView,stats:statsView}; const syncInfo=state.offline?'Offline · dane zapisują się na tym urządzeniu':state.cloudSession?(state.pendingDates.length?`${state.pendingDates.length} zmian oczekuje na synchronizację`:state.lastSyncedAt?`Ostatnia synchronizacja: ${new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit'}).format(new Date(state.lastSyncedAt))}`:'Synchronizacja aktywna'):''; $('#app').innerHTML=`<header class="topbar"><a href="#" class="brand" data-view="today"><span class="brand-mark">5</span><span>daily<span class="brand-light">wins</span></span></a><div class="topbar-right">${cloudControl()}<div class="top-date">${esc(dateLabel(localDateKey(),{weekday:'short',day:'numeric',month:'short'}))}</div></div></header>${syncInfo?`<div class="sync-info ${state.offline?'offline':''}" role="status">${esc(syncInfo)}</div>`:''}<div class="app-shell">${nav()}<main>${firstUseHelp()}${views[state.view]()}</main></div>${cloudDialog()}${state.notice?`<div class="toast" role="alert">${esc(state.notice)}</div>`:''}`; }

if (state.warning) { state.notice = state.warning; state.readOnly = state.warning.startsWith('Dane pochodzą z nowszej wersji'); }
else if (state.migrated) state.notice = 'Zaimportowano wcześniejsze dane. Oryginalny zapis został zachowany jako kopia.';
render();
document.addEventListener('click', e=>{
  const view=e.target.closest('[data-view]'); if(view){e.preventDefault();state.view=view.dataset.view;state.selectedDate=null;render();return;}
  if(e.target.closest('[data-action="plan-today"]')){state.view='planning';state.planDate=localDateKey();render();return;}
  if(e.target.closest('[data-action="dismiss-help"]')){state.showHelp=false;localStorage.setItem(HELP_KEY,'true');render();return;}
  const planFromHistory=e.target.closest('[data-action="plan-date-from-history"]');if(planFromHistory){state.view='planning';state.planDate=planFromHistory.dataset.date;state.selectedDate=null;render();return;}
  if(e.target.closest('[data-action="cloud"]')){state.cloudModal=true;render();return;}
  if(e.target.closest('[data-action="edit-cloud-config"]')){state.editCloudConfig=true;render();return;}
  if(e.target.closest('[data-action="cloud-sync"]')){syncCloud().catch(error=>{state.notice=error.message;render();});return;}
  if(e.target.closest('[data-action="cloud-logout"]')){signOutCloud().then(()=>{state.cloudSession=null;state.cloudStatus='Zaloguj do chmury';state.cloudModal=false;render();}).catch(error=>{state.notice=error.message;render();});return;}
  if(e.target.closest('[data-action="save-draft"]')){const rows=[...$('#plan-form').querySelectorAll('.form-row')];const goals=rows.map(r=>({text:r.querySelector('[name=text]').value,category:r.querySelector('[name=category]').value}));update(store=>saveDraft(store,state.planDate,goals));return;}
  const month=e.target.closest('[data-month]');if(month){state.month.setMonth(state.month.getMonth()+Number(month.dataset.month));render();return;}
  const hist=e.target.closest('[data-history-date]');if(hist){state.selectedDate=hist.dataset.historyDate;render();return;}
  const planDate=e.target.closest('[data-planning-date]');if(planDate){state.planDate=planDate.dataset.planningDate;render();return;}
  if(e.target.closest('.close[data-close="true"]') || e.target.matches('.modal-backdrop[data-close="true"]')){state.selectedDate=null;state.cloudModal=false;state.editCloudConfig=false;render();}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(state.cloudModal||state.selectedDate)){state.cloudModal=false;state.editCloudConfig=false;state.selectedDate=null;render();}});
document.addEventListener('change',e=>{
  if(e.target.matches('#plan-date')){state.planDate=e.target.value;render();return;}
  if(e.target.matches('[data-done]')) update(store=>setGoalDone(store,e.target.dataset.date,e.target.dataset.done,e.target.checked));
  if(e.target.closest('#plan-form')){const rows=[...$('#plan-form').querySelectorAll('.form-row')],count=rows.filter(r=>r.querySelector('[name=text]').value.trim()).length;$('#goal-count').textContent=`${count}/5 celów wpisanych${count===5?' · gotowe do zamrożenia':''}`;}
});
document.addEventListener('input',e=>{if(e.target.matches('#plan-form [name=text]')){const rows=[...$('#plan-form').querySelectorAll('.form-row')],count=rows.filter(r=>r.querySelector('[name=text]').value.trim()).length;$('#goal-count').textContent=`${count}/5 celów wpisanych${count===5?' · gotowe do zamrożenia':''}`;}});
document.addEventListener('submit',e=>{if(e.target.id!=='plan-form')return;e.preventDefault();const rows=[...e.target.querySelectorAll('.form-row')];const goals=rows.map(r=>({text:r.querySelector('[name=text]').value,category:r.querySelector('[name=category]').value}));update(store=>freezeDay(store,state.planDate,goals));});
document.addEventListener('submit',async e=>{
  if(e.target.id==='cloud-config-form'){
    e.preventDefault();const form=e.target;
    try{saveCloudConfig(form.elements.url.value,form.elements.key.value);state.editCloudConfig=false;state.cloudModal=false;state.notice='Połączenie zapisano na tym urządzeniu. Zaloguj się do synchronizacji.';render();await initializeCloud();}
    catch(error){state.notice=error.message;render();}return;
  }
  if(e.target.id==='cloud-login-form'){
    e.preventDefault();try{await sendLoginLink(e.target.elements.email.value,`${location.origin}${location.pathname}`);state.notice='Link logowania wysłany. Otwórz go na tym urządzeniu. Po zalogowaniu aplikacja zapamięta Cię na tym urządzeniu.';render();}
    catch(error){const message=String(error.message||error);state.notice=/rate limit|too many requests/i.test(message)?'Supabase chwilowo ogranicza liczbę e-maili. Nie ponawiaj teraz wielu prób; poczekaj, a potem wyślij jeden link.':`Nie udało się wysłać linku: ${message}`;render();}
  }
});
window.addEventListener('focus',()=>{if(state.cloudSession)syncCloud().catch(()=>{});});
window.addEventListener('online',()=>{state.offline=false;if(state.cloudSession)syncCloud().catch(()=>{});else initializeCloud().catch(()=>{});});
window.addEventListener('offline',()=>{state.offline=true;if(state.cloudSession){state.cloudStatus='Zapisano na tym urządzeniu · oczekuje na internet';setCloudLabel();render();}});
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
initializeCloud();
