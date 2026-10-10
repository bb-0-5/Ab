#!/usr/bin/env bash
# Run on the existing AWS Docker host after reviewing changes.
# Requires a clean checkout of bb-0-5/Ab on main, Docker/Compose,
# and an existing private .env.production. Never run in GitHub Actions.
set -Eeuo pipefail

APP_DIR="${ABOVEBOUND_APP_DIR:-/opt/beyondbound}"
BACKUP_DIR="${ABOVEBOUND_BACKUP_DIR:-$HOME/abovebound-backups}"
cd "$APP_DIR"

command -v git >/dev/null
command -v docker >/dev/null
command -v curl >/dev/null
docker compose version >/dev/null

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo 'Refusing: checkout must be on the main branch.' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Refusing: working tree is not clean. Back up and reconcile changes first.' >&2
  exit 1
fi
if [[ ! -f .env.production ]]; then
  echo 'Refusing: .env.production is missing. Keep production secrets on host only.' >&2
  exit 1
fi

origin="$(git remote get-url origin)"
case "$origin" in
  https://github.com/bb-0-5/Ab|https://github.com/bb-0-5/Ab.git|git@github.com:bb-0-5/Ab.git) ;;
  *)
    echo 'Refusing: remote origin must be the reviewed bb-0-5/Ab repository.' >&2
    echo 'Check git remote -v and update the origin explicitly after review.' >&2
    exit 1 ;;
esac

previous="$(git rev-parse HEAD)"
git fetch origin main
target="$(git rev-parse FETCH_HEAD)"
if ! git merge-base --is-ancestor "$previous" "$target"; then
  echo 'Refusing: remote main is not a fast-forward from the current checkout.' >&2
  exit 1
fi
if [[ "$previous" == "$target" ]]; then
  echo "Nothing to deploy; checkout already at $target."
  exit 0
fi

# Take a persistent-volume backup BEFORE changing any live source or images.
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
if docker volume inspect beyondbound-data >/dev/null 2>&1; then
  backup_file="beyondbound-data-$(date -u +%Y%m%dT%H%M%SZ)-${previous:0:8}.tgz"
  echo "Backing up application state to $BACKUP_DIR/$backup_file"
  docker run --rm \
    -v beyondbound-data:/source:ro \
    -v "$BACKUP_DIR":/backup \
    alpine:3.20 sh -eu -c 'tar czf "/backup/$1" -C /source .' sh "$backup_file"
fi

rollback() {
  echo 'Deployment verification failed; restoring previous checked-out source and Docker application.' >&2
  git reset --hard "$previous" >&2
  export ABOVEBOUND_RELEASE_SHA="$previous"
  docker compose --env-file .env.production up -d --build >&2 || true
}

git merge --ff-only "$target"
export ABOVEBOUND_RELEASE_SHA="$target"
if ! docker compose --env-file .env.production up -d --build; then
  rollback
  exit 1
fi

ok=false
for attempt in {1..15}; do
  health="$(curl --silent --show-error --max-time 5 http://127.0.0.1:3000/api/health || true)"
  if [[ "$health" == *"\"status\":\"ok\""* && "$health" == *"\"releaseSha\":\"$target\""* ]]; then
    ok=true
    break
  fi
  sleep 2
done
if [[ "$ok" != true ]]; then
  rollback
  exit 1
fi

echo "Local AboveBound production health check verified release $target."
echo 'Cloudflare Tunnel is separate: check https://abovebound.org/api/health externally.'
echo "Keep $BACKUP_DIR available for data rollback; restoring code does not roll back a changed data schema."
