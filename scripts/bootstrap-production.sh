#!/usr/bin/env bash

set -Eeuo pipefail

if [[ "${1:-}" != "--apply" ]]; then
    echo "This is a one-time production cutover and causes brief downtime." >&2
    echo "Run: bash scripts/bootstrap-production.sh --apply" >&2
    exit 2
fi

SOURCE_REPO="${SOURCE_REPO:-/home/talinoserver2/Documents/dost-caraga-pr}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/talinoserver2/apps/dost-caraga-pr}"
DEPLOY_SHA="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
BACKEND_PATH="$SOURCE_REPO/pr_backend"

for command_name in git php composer npm npx pg_dump tar curl flock rsync nginx; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Required command not found: $command_name" >&2
        exit 2
    fi
done

if [[ ! -f "$BACKEND_PATH/.env" || ! -d "$BACKEND_PATH/storage" ]]; then
    echo "The current backend .env and storage directory are required." >&2
    exit 2
fi

if ! grep -Eq '^APP_ENV=production([[:space:]]*)$' "$BACKEND_PATH/.env"; then
    echo "Set APP_ENV=production in pr_backend/.env before bootstrap." >&2
    exit 2
fi

if ! grep -Eq '^APP_DEBUG=false([[:space:]]*)$' "$BACKEND_PATH/.env"; then
    echo "Set APP_DEBUG=false in pr_backend/.env before bootstrap." >&2
    exit 2
fi

git -C "$SOURCE_REPO" fetch --quiet origin main
if [[ "$DEPLOY_SHA" != "$(git -C "$SOURCE_REPO" rev-parse origin/main)" ]]; then
    echo "Checkout must exactly match origin/main before the production cutover." >&2
    exit 2
fi

mkdir -p "$DEPLOY_ROOT/shared/storage" "$DEPLOY_ROOT/releases" "$DEPLOY_ROOT/backups"
if [[ ! -f "$DEPLOY_ROOT/shared/backend.env" ]]; then
    install -m 0600 "$BACKEND_PATH/.env" "$DEPLOY_ROOT/shared/backend.env"
fi
rsync -a "$BACKEND_PATH/storage/" "$DEPLOY_ROOT/shared/storage/"

php "$BACKEND_PATH/artisan" down --retry=60 --refresh=15
restore_old_app() {
    php "$BACKEND_PATH/artisan" up || true
}
trap restore_old_app ERR

SOURCE_REPO="$SOURCE_REPO" \
DEPLOY_ROOT="$DEPLOY_ROOT" \
SKIP_SERVICE_RESTART=true \
SKIP_HEALTHCHECK=true \
    bash "$SOURCE_REPO/scripts/deploy-production.sh" "$DEPLOY_SHA"

sudo install -m 0644 "$SOURCE_REPO/ops/systemd/dost-caraga-pr-backend.service" /etc/systemd/system/dost-caraga-pr-backend.service
sudo install -m 0644 "$SOURCE_REPO/ops/systemd/dost-caraga-pr-frontend.service" /etc/systemd/system/dost-caraga-pr-frontend.service
sudo install -m 0644 "$SOURCE_REPO/ops/systemd/dost-caraga-pr-scheduler.service" /etc/systemd/system/dost-caraga-pr-scheduler.service
sudo visudo -cf "$SOURCE_REPO/ops/sudoers/dost-caraga-pr-deploy"
sudo install -m 0440 "$SOURCE_REPO/ops/sudoers/dost-caraga-pr-deploy" /etc/sudoers.d/dost-caraga-pr-deploy

sudo install -m 0644 "$SOURCE_REPO/ops/nginx/dost-caraga-pr.conf" /etc/nginx/sites-available/dost-caraga-pr.conf
sudo ln -sfn /etc/nginx/sites-available/dost-caraga-pr.conf /etc/nginx/sites-enabled/dost-caraga-pr.conf
sudo nginx -t

sudo systemctl daemon-reload
sudo systemctl enable dost-caraga-pr-backend.service dost-caraga-pr-frontend.service dost-caraga-pr-scheduler.service
sudo systemctl restart dost-caraga-pr-backend.service
sudo systemctl restart dost-caraga-pr-frontend.service
sudo systemctl restart dost-caraga-pr-scheduler.service
sudo systemctl reload nginx.service

if grep -Eq '^QUEUE_CONNECTION=(database|redis|sqs)([[:space:]]*)$' "$DEPLOY_ROOT/shared/backend.env"; then
    sudo install -m 0644 "$SOURCE_REPO/ops/systemd/dost-caraga-pr-queue.service" /etc/systemd/system/dost-caraga-pr-queue.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now dost-caraga-pr-queue.service
fi

php "$DEPLOY_ROOT/current/pr_backend/artisan" up
curl --fail --silent --show-error --retry 12 --retry-delay 2 --retry-all-errors http://127.0.0.1:8000/up >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 2 --retry-all-errors http://127.0.0.1:5175/login >/dev/null
curl --fail --silent --show-error --retry 12 --retry-delay 2 --retry-all-errors -H 'Host: pr.dostcaraga.ph' http://127.0.0.1:5173/login >/dev/null

trap - ERR
echo "Production release layout is active at $DEPLOY_ROOT/current ($DEPLOY_SHA)."
