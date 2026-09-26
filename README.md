# Daily Wins

## Otwieranie na Macu

Nie uruchamiaj `index.html` dwuklikiem. Safari blokuje moduły aplikacji z adresu `file://` i pokazuje pustą stronę.

1. Rozpakuj ZIP.
2. Otwórz folder `daily-wins-pwa`.
3. Kliknij dwukrotnie `Uruchom Daily Wins.command`.
4. Jeśli macOS zapyta o potwierdzenie, kliknij prawym przyciskiem plik, wybierz **Otwórz**, a następnie potwierdź.

Skrypt uruchamia wbudowany serwer macOS i otwiera `http://localhost:8000`. Zostaw otwarte okno Terminala, gdy korzystasz z aplikacji. Zatrzymasz serwer skrótem `Control+C`.

## iPhone i instalacja

Do instalacji na iPhonie opublikuj projekt przez GitHub Pages (instrukcja architektury). Otwórz opublikowany adres w Safari, wybierz **Udostępnij → Dodaj do ekranu początkowego**. Adres `localhost` działa wyłącznie na tym Macu.

## Supabase

Po utworzeniu projektu uruchom `supabase/schema.sql` raz w SQL Editor. Następnie w aplikacji wybierz **Połącz z chmurą**, podaj Project URL i klucz **publishable** (nigdy secret/service-role), po czym zaloguj się linkiem e-mail. W Supabase Auth dodaj aplikacji adresy lokalny i GitHub Pages do listy Redirect URLs. Konfigurację URL/klucza wykonaj osobno na Macu i iPhonie; dane po zalogowaniu synchronizują się przez Supabase.

## Kontrole

`npm test` uruchamia testy mechaniki, a `npm run check` kontroluje składnię JavaScript.
