#!/bin/sh
cd "$(dirname "$0")"
URL="http://127.0.0.1:8000"
LOG="${TMPDIR:-/tmp}/daily-wins-server.log"
/usr/bin/ruby -run -e httpd . -p 8000 -b 127.0.0.1 >"$LOG" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if /usr/bin/curl --silent --fail "$URL/" >/dev/null; then
    echo "Daily Wins działa pod $URL"
    open "$URL/"
    wait "$SERVER_PID"
    exit $?
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Nie udało się uruchomić serwera. Szczegóły:"
    cat "$LOG"
    echo "Zamknij to okno klawiszem Enter."
    read -r _
    exit 1
  fi
  sleep 1
done
echo "Serwer nie odpowiedział. Szczegóły:"
cat "$LOG"
echo "Zamknij to okno klawiszem Enter."
read -r _
exit 1
