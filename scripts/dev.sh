#!/usr/bin/env bash
#
# Ops Hub local dev controller.
#
#   ./scripts/dev.sh up        start db + api + web, then health-check them
#   ./scripts/dev.sh down      stop api + web (db keeps running)
#   ./scripts/dev.sh down --all  also stop stray api/web processes from other worktrees
#   ./scripts/dev.sh restart   down + up
#   ./scripts/dev.sh status    what's running, on which ports, and is it healthy
#   ./scripts/dev.sh logs      tail api + web logs
#   ./scripts/dev.sh seed      re-run the Prisma seed
#   ./scripts/dev.sh doctor    diagnose env / migration-drift problems
#   ./scripts/dev.sh db        psql shell into the dev database
#
# Logs land in .dev/logs/, pidfiles in .dev/pids/ (both gitignored).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEV_DIR="$ROOT/.dev"
LOG_DIR="$DEV_DIR/logs"
PID_DIR="$DEV_DIR/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

DB_CONTAINER="opshub-postgres"
COMPOSE_FILE="$ROOT/db/docker-compose.yml"

# API port comes from api/.env so this script never disagrees with the app.
# `|| true` matters: .env is gitignored, so it's absent in a fresh clone or a new
# worktree, and a failing sed would abort the whole script under `set -e`.
API_PORT="$(sed -n 's/^PORT=\([0-9]*\).*/\1/p' "$ROOT/api/.env" 2>/dev/null | head -1 || true)"
API_PORT="${API_PORT:-3333}"
WEB_PORT="${WEB_PORT:-5173}"

# ---------------------------------------------------------------- output ----

if [ -t 1 ]; then
  R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; B=$'\033[34m'; DIM=$'\033[2m'; N=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; DIM=''; N=''
fi

ok()   { printf '%s  ok  %s %s\n' "$G" "$N" "$*"; }
warn() { printf '%s warn %s %s\n' "$Y" "$N" "$*"; }
bad()  { printf '%s fail %s %s\n' "$R" "$N" "$*"; }
info() { printf '%s  ..  %s %s\n' "$B" "$N" "$*"; }
head_() { printf '\n%s== %s ==%s\n' "$B" "$*" "$N"; }

die() { bad "$*"; exit 1; }

# ---------------------------------------------------------------- helpers ---

# Must never return non-zero: a free port is a normal answer, and under
# `set -e -o pipefail` a failing lsof would abort the whole script.
port_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true; }

port_busy() { [ -n "$(port_pid "$1")" ]; }

# Pids currently serving our ports, plus their parents. `npm run dev` is the
# grandparent of the process that actually binds, so all of them must be spared
# when we hunt for strays.
active_pids() {
  local port pid depth
  for port in "$API_PORT" "$WEB_PORT"; do
    pid="$(port_pid "$port")"
    depth=0
    while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null && [ "$depth" -lt 4 ]; do
      echo "$pid"
      pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
      depth=$((depth + 1))
    done
  done
}

# Every api/web dev server under the repo that isn't serving our ports.
stray_pids() {
  local active; active="$(active_pids | sort -u)"
  local all; all="$(pgrep -f 'WebstormProjects/ProGM.*(tsx watch src/index.ts|node_modules/.bin/vite)' 2>/dev/null | sort -u || true)"
  [ -n "$all" ] || return 0
  comm -23 <(printf '%s\n' "$all") <(printf '%s\n' "$active")
}

# Wait until `cmd` succeeds, up to $1 seconds.
wait_for() {
  local timeout="$1"; shift
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    if "$@" >/dev/null 2>&1; then return 0; fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

api_healthy() { curl -fsS -m 3 "http://localhost:$API_PORT/api/health" >/dev/null 2>&1; }
web_healthy() { curl -fsS -m 3 -o /dev/null "http://localhost:$WEB_PORT/" 2>/dev/null; }

psql_q() { docker exec "$DB_CONTAINER" psql -U opshub -d opshub -tAc "$1" 2>/dev/null || true; }

running() {  # running <name> -> 0 if our pidfile process is alive
  local pidfile="$PID_DIR/$1.pid"
  [ -f "$pidfile" ] || return 1
  local pid; pid="$(cat "$pidfile")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# stop_one <name> <port>
# Kills the pid we recorded, then anything still holding the port — `npm run dev`
# spawns tsx/vite children that outlive the parent. Killing by process group is
# NOT safe here: the backgrounded job shares this script's group.
stop_one() {
  local name="$1" port="$2" pidfile="$PID_DIR/$1.pid" pid=""

  if running "$name"; then
    pid="$(cat "$pidfile")"
    kill -TERM "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    ok "stopped $name (pid $pid)"
  else
    info "$name had no tracked process"
  fi
  rm -f "$pidfile"

  # Orphaned child still on the port?
  local held; held="$(port_pid "$port")"
  if [ -n "$held" ]; then
    kill -TERM "$held" 2>/dev/null || true
    sleep 1
    held="$(port_pid "$port")"
    [ -n "$held" ] && kill -KILL "$held" 2>/dev/null || true
    ok "freed port $port"
  fi
  return 0
}

# --------------------------------------------------------------------- db ---

ensure_db() {
  docker info >/dev/null 2>&1 || die "Docker isn't running. Start Docker Desktop and retry."

  if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    info "starting Postgres..."
    docker compose -f "$COMPOSE_FILE" up -d >/dev/null
  fi

  if ! wait_for 45 docker exec "$DB_CONTAINER" pg_isready -U opshub -d opshub; then
    die "Postgres never became ready. Try: docker compose -f db/docker-compose.yml logs"
  fi
  ok "Postgres ready on :5432"
}

# ------------------------------------------------------------------ drift ---
#
# The failure this catches: worktrees share one dev database. A branch can apply
# migrations that the checkout you're sitting in doesn't have, so the API queries
# tables that no longer match. Symptom is a 500 with a Prisma P2021/P2022.

check_drift() {
  local db_migs local_migs ahead behind
  db_migs="$(psql_q "select migration_name from _prisma_migrations where finished_at is not null order by 1;" || true)"
  [ -n "$db_migs" ] || { warn "couldn't read _prisma_migrations"; return 0; }
  local_migs="$(ls "$ROOT/api/prisma/migrations" 2>/dev/null | grep -v migration_lock.toml | sort)"

  ahead="$(comm -23 <(printf '%s\n' "$db_migs") <(printf '%s\n' "$local_migs"))"
  behind="$(comm -13 <(printf '%s\n' "$db_migs") <(printf '%s\n' "$local_migs"))"

  if [ -n "$ahead" ]; then
    bad "database is AHEAD of this checkout — applied here but missing from api/prisma/migrations:"
    printf '%s        %s%s\n' "$DIM" "$(printf '%s' "$ahead" | tr '\n' ' ')" "$N"
    echo "        Another branch/worktree migrated the shared dev DB."
    echo "        Fix: check out or merge that branch, or reset with: ./scripts/dev.sh doctor --reset-db"
  fi
  if [ -n "$behind" ]; then
    warn "migrations in this checkout not yet applied to the DB:"
    printf '%s        %s%s\n' "$DIM" "$(printf '%s' "$behind" | tr '\n' ' ')" "$N"
    echo "        Fix: npx prisma migrate deploy --schema api/prisma/schema.prisma"
  fi
  if [ -z "$ahead" ] && [ -z "$behind" ]; then
    ok "migrations in sync ($(printf '%s\n' "$db_migs" | wc -l | tr -d ' ') applied)"
  fi
  # Drift is reported, never fatal — `set -e` must not abort `up` on it.
  return 0
}

# --------------------------------------------------------------------- up ---

cmd_up() {
  head_ "config"
  local missing=0
  for f in api/.env web/.env; do
    if [ -f "$ROOT/$f" ]; then
      ok "$f"
    else
      bad "$f missing — copy it: cp $f.example $f"
      missing=1
    fi
  done
  [ "$missing" -eq 0 ] || die ".env files are gitignored, so a fresh clone or new worktree needs them copied in."

  head_ "database"
  ensure_db

  head_ "schema"
  check_drift

  head_ "dependencies"
  if [ ! -d "$ROOT/node_modules" ] || [ ! -d "$ROOT/api/node_modules" ]; then
    info "installing npm workspaces..."
    npm install --silent
  fi
  ok "node_modules present"

  # The Prisma client is generated into api/src/generated/, which is gitignored —
  # so it's absent in a fresh clone and the API dies with ERR_MODULE_NOT_FOUND.
  if [ ! -d "$ROOT/api/src/generated/prisma" ]; then
    info "generating Prisma client..."
    npx prisma generate --schema "$ROOT/api/prisma/schema.prisma" >/dev/null
  fi
  ok "Prisma client generated"

  head_ "servers"

  # API
  if api_healthy; then
    ok "api already up on :$API_PORT"
  elif port_busy "$API_PORT"; then
    bad "port $API_PORT is taken by pid $(port_pid "$API_PORT") but /api/health doesn't answer."
    echo "     Probably a stale server from another worktree. Run: ./scripts/dev.sh down --all"
    exit 1
  else
    info "starting api..."
    ( cd "$ROOT" && nohup npm run dev -w api >"$LOG_DIR/api.log" 2>&1 & echo $! >"$PID_DIR/api.pid" )
    if wait_for 60 api_healthy; then
      ok "api listening on :$API_PORT"
    else
      bad "api failed to start — last 30 lines:"
      tail -30 "$LOG_DIR/api.log" | sed 's/^/     /'
      exit 1
    fi
  fi

  # Web
  if web_healthy; then
    ok "web already up on :$WEB_PORT"
  elif port_busy "$WEB_PORT"; then
    bad "port $WEB_PORT is taken by pid $(port_pid "$WEB_PORT") but it isn't answering."
    echo "     Run: ./scripts/dev.sh down --all"
    exit 1
  else
    info "starting web..."
    # --strictPort: fail loudly instead of silently sliding to 5174, which would
    # leave the UI on a port nothing else in this script is looking at.
    ( cd "$ROOT" && nohup npm run dev -w web -- --port "$WEB_PORT" --strictPort >"$LOG_DIR/web.log" 2>&1 & echo $! >"$PID_DIR/web.pid" )
    if wait_for 60 web_healthy; then
      ok "web listening on :$WEB_PORT"
    else
      bad "web failed to start — last 30 lines:"
      tail -30 "$LOG_DIR/web.log" | sed 's/^/     /'
      exit 1
    fi
  fi

  cmd_creds
}

cmd_creds() {
  head_ "ready"
  cat <<EOF
  App          http://localhost:$WEB_PORT
  API          http://localhost:$API_PORT/api
  Health       http://localhost:$API_PORT/api/health

  Sign in with (seeded dev accounts, local only):
    admin    superadmin@opshub.local / opshub123!
    admin    dev@opshub.local        / devpassword123
    member   member@opshub.local     / memberpassword123

  Logs         ./scripts/dev.sh logs
  Stop         ./scripts/dev.sh down
EOF
}

# ------------------------------------------------------------------- down ---

cmd_down() {
  stop_one api "$API_PORT"
  stop_one web "$WEB_PORT"

  if [ "${1:-}" = "--all" ]; then
    head_ "stray processes"
    # Dev servers launched by hand or by another worktree, anywhere under the repo.
    local pids; pids="$(stray_pids)"
    if [ -n "$pids" ]; then
      for pid in $pids; do
        local cmdline; cmdline="$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-88)"
        kill -TERM "$pid" 2>/dev/null && ok "killed $pid  ${DIM}${cmdline}${N}" || true
      done
    else
      ok "no stray api/web processes"
    fi
  fi
  info "Postgres left running (stop it with: docker compose -f db/docker-compose.yml down)"
}

# ----------------------------------------------------------------- status ---

cmd_status() {
  head_ "database"
  if docker info >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}\t{{.Status}}' | grep -q "$DB_CONTAINER"; then
      ok "postgres  $(docker ps --filter "name=$DB_CONTAINER" --format '{{.Status}}')"
    else
      bad "postgres container not running"
    fi
  else
    bad "docker not running"
  fi

  head_ "servers"
  if api_healthy; then ok "api  :$API_PORT  healthy  (pid $(port_pid "$API_PORT"))"
  elif port_busy "$API_PORT"; then warn "api  :$API_PORT  port busy but unhealthy (pid $(port_pid "$API_PORT"))"
  else bad "api  :$API_PORT  down"; fi

  if web_healthy; then ok "web  :$WEB_PORT  healthy  (pid $(port_pid "$WEB_PORT"))"
  elif port_busy "$WEB_PORT"; then warn "web  :$WEB_PORT  port busy but unhealthy (pid $(port_pid "$WEB_PORT"))"
  else bad "web  :$WEB_PORT  down"; fi

  head_ "stray dev servers elsewhere in the repo"
  local strays; strays="$(stray_pids)"
  if [ -n "$strays" ]; then
    for pid in $strays; do
      printf '       %s  %s%s%s\n' "$pid" "$DIM" "$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-88)" "$N"
    done
    warn "not serving :$API_PORT or :$WEB_PORT — they waste memory and can steal ports on restart"
    echo "       clear them with: ./scripts/dev.sh down --all"
  else
    ok "none"
  fi
  return 0
}

# ----------------------------------------------------------------- doctor ---

cmd_doctor() {
  if [ "${1:-}" = "--reset-db" ]; then
    head_ "reset local dev database"
    echo "This DROPS the local dev database volume and rebuilds it from migrations + seed."
    echo "Local dev data only (container $DB_CONTAINER). Nothing remote is touched."
    printf 'Type "reset" to confirm: '
    read -r reply
    [ "$reply" = "reset" ] || { info "aborted"; exit 0; }
    docker compose -f "$COMPOSE_FILE" down -v
    ensure_db
    npx prisma migrate deploy --schema "$ROOT/api/prisma/schema.prisma"
    npm run prisma:seed -w api
    ok "database reset"
    return
  fi

  head_ "environment"
  command -v node >/dev/null && ok "node $(node -v)" || bad "node not found"
  command -v npm  >/dev/null && ok "npm  $(npm -v)"  || bad "npm not found"
  docker info >/dev/null 2>&1 && ok "docker running" || bad "docker not running"

  head_ "config files"
  [ -f "$ROOT/api/.env" ] && ok "api/.env (PORT=$API_PORT)" || bad "api/.env missing — copy api/.env.example"
  [ -f "$ROOT/web/.env" ] && ok "web/.env" || bad "web/.env missing — copy web/.env.example"
  if [ -f "$ROOT/web/.env" ]; then
    local api_url; api_url="$(sed -n 's/^VITE_API_URL=\(.*\)/\1/p' "$ROOT/web/.env" | head -1)"
    if [ "$api_url" = "http://localhost:$API_PORT/api" ]; then
      ok "VITE_API_URL matches api port"
    else
      bad "VITE_API_URL is '$api_url' but the api runs on :$API_PORT — the UI will fail to load data"
    fi
  fi

  head_ "dependencies"
  [ -d "$ROOT/node_modules" ] && ok "root node_modules" || bad "run: npm install"

  head_ "database"
  if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    ok "container up"
    ok "$(psql_q "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';") tables, $(psql_q "select count(*) from users;") users"
    check_drift
  else
    bad "container down — ./scripts/dev.sh up"
  fi

  head_ "servers"
  api_healthy && ok "api healthy" || warn "api not responding on :$API_PORT"
  web_healthy && ok "web healthy" || warn "web not responding on :$WEB_PORT"

  head_ "api smoke test"
  if api_healthy; then
    local token
    token="$(curl -fsS -m 10 -X POST "http://localhost:$API_PORT/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d '{"email":"superadmin@opshub.local","password":"opshub123!"}' 2>/dev/null \
      | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
    if [ -z "$token" ]; then
      bad "login failed — try: ./scripts/dev.sh seed"
    else
      ok "login works"
      for p in /api/inventory/items /api/deliveries /api/drawings /api/requisitions \
               /api/tasks /api/sites /api/schedule/activities /api/concrete/pours; do
        local code
        code="$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" "http://localhost:$API_PORT$p")"
        case "$code" in
          2*) ok   "$code  $p" ;;
          5*) bad  "$code  $p   <-- server error, check ./scripts/dev.sh logs" ;;
          *)  warn "$code  $p" ;;
        esac
      done
    fi
  else
    warn "skipped (api down)"
  fi
  echo
}

# ------------------------------------------------------------------ misc ----

cmd_logs() {
  local files=()
  [ -f "$LOG_DIR/api.log" ] && files+=("$LOG_DIR/api.log")
  [ -f "$LOG_DIR/web.log" ] && files+=("$LOG_DIR/web.log")
  [ ${#files[@]} -eq 0 ] && die "no logs yet — ./scripts/dev.sh up"
  tail -n 40 -f "${files[@]}"
}

cmd_seed() { ensure_db; npm run prisma:seed -w api; }

cmd_db() { ensure_db; docker exec -it "$DB_CONTAINER" psql -U opshub -d opshub; }

usage() { sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

case "${1:-up}" in
  up)      shift; cmd_up "$@" ;;
  down)    shift; cmd_down "$@" ;;
  restart) shift; cmd_down "$@"; sleep 1; cmd_up ;;
  status)  shift; cmd_status "$@" ;;
  logs)    shift; cmd_logs "$@" ;;
  seed)    shift; cmd_seed "$@" ;;
  doctor)  shift; cmd_doctor "$@" ;;
  db)      shift; cmd_db "$@" ;;
  creds)   shift; cmd_creds "$@" ;;
  -h|--help|help) usage ;;
  *)       bad "unknown command: $1"; echo; usage; exit 1 ;;
esac
