#!/usr/bin/env bash

set -Eeuo pipefail

DEPLOY_SHA="${1:-}"
SOURCE_REPO="${SOURCE_REPO:-/home/talinoserver2/Documents/dost-caraga-pr}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/talinoserver2/apps/dost-caraga-pr}"
BACKEND_SERVICE="${BACKEND_SERVICE:-dost-caraga-pr-backend.service}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-dost-caraga-pr-frontend.service}"
SCHEDULER_SERVICE="${SCHEDULER_SERVICE:-dost-caraga-pr-scheduler.service}"
QUEUE_SERVICE="${QUEUE_SERVICE:-dost-caraga-pr-queue.service}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:8000/up}"
FRONTEND_HEALTH_URL="${FRONTEND_HEALTH_URL:-http://127.0.0.1:5175/login}"
SKIP_SERVICE_RESTART="${SKIP_SERVICE_RESTART:-false}"
SKIP_HEALTHCHECK="${SKIP_HEALTHCHECK:-false}"

if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Deploy SHA must be a full 40-character lowercase Git commit SHA." >&2
    exit 2
fi

for command_name in git php composer npm npx pg_dump tar curl flock; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Required command not found: $command_name" >&2
        exit 2
    fi
done

mkdir -p "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/shared" "$DEPLOY_ROOT/backups"
exec 9>"$DEPLOY_ROOT/deploy.lock"
if ! flock -n 9; then
    echo "Another production deployment is already running." >&2
    exit 1
fi

if [[ ! -f "$DEPLOY_ROOT/shared/backend.env" ]]; then
    echo "Missing $DEPLOY_ROOT/shared/backend.env; run the production bootstrap first." >&2
    exit 2
fi

if [[ ! -d "$DEPLOY_ROOT/shared/storage" ]]; then
    echo "Missing $DEPLOY_ROOT/shared/storage; run the production bootstrap first." >&2
    exit 2
fi

git -C "$SOURCE_REPO" fetch --quiet origin main
if ! git -C "$SOURCE_REPO" merge-base --is-ancestor "$DEPLOY_SHA" origin/main; then
    echo "Refusing to deploy a revision that is not contained in origin/main." >&2
    exit 2
fi

RELEASE_PATH="$DEPLOY_ROOT/releases/$DEPLOY_SHA"
PREVIOUS_RELEASE=""
if [[ -L "$DEPLOY_ROOT/current" ]]; then
    PREVIOUS_RELEASE="$(readlink -f "$DEPLOY_ROOT/current")"
fi

if [[ ! -e "$RELEASE_PATH/.git" ]]; then
    git -C "$SOURCE_REPO" worktree add --detach "$RELEASE_PATH" "$DEPLOY_SHA"
fi

if [[ ! -L "$RELEASE_PATH/pr_backend/.env" ]]; then
    rm -f "$RELEASE_PATH/pr_backend/.env"
    ln -s "$DEPLOY_ROOT/shared/backend.env" "$RELEASE_PATH/pr_backend/.env"
fi

if [[ ! -L "$RELEASE_PATH/pr_backend/storage" ]]; then
    if [[ -d "$RELEASE_PATH/pr_backend/storage" ]]; then
        cp -a "$RELEASE_PATH/pr_backend/storage/." "$DEPLOY_ROOT/shared/storage/"
        mv "$RELEASE_PATH/pr_backend/storage" "$RELEASE_PATH/pr_backend/storage.release-skeleton"
    fi
    ln -s "$DEPLOY_ROOT/shared/storage" "$RELEASE_PATH/pr_backend/storage"
fi

composer install \
    --working-dir="$RELEASE_PATH/pr_backend" \
    --no-dev \
    --no-interaction \
    --prefer-dist \
    --optimize-autoloader \
    --no-progress

npx --yes npm@11.10.0 --prefix "$RELEASE_PATH/pr_frontend" ci --no-audit --no-fund
npm --prefix "$RELEASE_PATH/pr_frontend" run build

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_PATH="$DEPLOY_ROOT/backups/$TIMESTAMP-$DEPLOY_SHA"
mkdir -p "$BACKUP_PATH"
php "$RELEASE_PATH/scripts/backup-production.php" \
    "$RELEASE_PATH/pr_backend" \
    "$BACKUP_PATH"
tar -C "$DEPLOY_ROOT/shared" -czf "$BACKUP_PATH/storage.tar.gz" storage
chmod 0600 "$BACKUP_PATH/storage.tar.gz"

if [[ -n "$PREVIOUS_RELEASE" && -f "$PREVIOUS_RELEASE/pr_backend/artisan" ]]; then
    php "$PREVIOUS_RELEASE/pr_backend/artisan" down --retry=60 --refresh=15 || true
fi

rollback() {
    local exit_code=$?
    trap - ERR
    if [[ -n "$PREVIOUS_RELEASE" && -d "$PREVIOUS_RELEASE" ]]; then
        ln -sfn "$PREVIOUS_RELEASE" "$DEPLOY_ROOT/current.rollback"
        mv -Tf "$DEPLOY_ROOT/current.rollback" "$DEPLOY_ROOT/current"
        if [[ "$SKIP_SERVICE_RESTART" != "true" ]]; then
            sudo systemctl restart "$BACKEND_SERVICE" || true
            sudo systemctl restart "$FRONTEND_SERVICE" || true
            sudo systemctl restart "$SCHEDULER_SERVICE" || true
            if systemctl list-unit-files "$QUEUE_SERVICE" --no-legend 2>/dev/null | grep -Fq "$QUEUE_SERVICE"; then
                sudo systemctl restart "$QUEUE_SERVICE" || true
            fi
        fi
        php "$PREVIOUS_RELEASE/pr_backend/artisan" up || true
    fi
    echo "Deployment failed. The previous code release was restored; review database migrations before retrying." >&2
    exit "$exit_code"
}
trap rollback ERR

php "$RELEASE_PATH/pr_backend/artisan" migrate --force --no-interaction
php "$RELEASE_PATH/pr_backend/artisan" optimize

ln -sfn "$RELEASE_PATH" "$DEPLOY_ROOT/current.next"
mv -Tf "$DEPLOY_ROOT/current.next" "$DEPLOY_ROOT/current"

if [[ "$SKIP_SERVICE_RESTART" != "true" ]]; then
    sudo systemctl restart "$BACKEND_SERVICE"
    sudo systemctl restart "$FRONTEND_SERVICE"
    sudo systemctl restart "$SCHEDULER_SERVICE"
    if systemctl list-unit-files "$QUEUE_SERVICE" --no-legend 2>/dev/null | grep -Fq "$QUEUE_SERVICE"; then
        sudo systemctl restart "$QUEUE_SERVICE"
    fi
fi

php "$RELEASE_PATH/pr_backend/artisan" up

if [[ "$SKIP_HEALTHCHECK" != "true" ]]; then
    curl --fail --silent --show-error --retry 12 --retry-delay 2 --retry-all-errors "$BACKEND_HEALTH_URL" >/dev/null
    curl --fail --silent --show-error --retry 12 --retry-delay 2 --retry-all-errors "$FRONTEND_HEALTH_URL" >/dev/null
fi

trap - ERR
echo "Deployed $DEPLOY_SHA successfully. Backups: $BACKUP_PATH"
