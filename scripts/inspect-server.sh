#!/usr/bin/env bash
# Read-only inventory for planning deployment. Does not read .env values or logs.
set -eu

project_path="${1:-$HOME/Documents/dost-caraga-pr}"

printf 'Operating system\n'
if [ -r /etc/os-release ]; then
  awk -F= '/^(NAME|VERSION|VERSION_ID|ID)=/ { print }' /etc/os-release
fi
printf '\nArchitecture: '
uname -m
printf 'Current user: '
id -un
printf '\nAvailable tools\n'
for tool in php composer node npm psql nginx docker tailscale; do
  if command -v "$tool" >/dev/null 2>&1; then
    printf '%s: %s\n' "$tool" "$(command -v "$tool")"
  else
    printf '%s: not found in PATH\n' "$tool"
  fi
done

printf '\nRuntime versions\n'
if command -v php >/dev/null 2>&1; then
  php -r 'echo "PHP ", PHP_VERSION, PHP_EOL; foreach (["pdo_pgsql", "mbstring", "dom", "xml", "intl", "curl", "zip", "fileinfo"] as $ext) echo $ext, ": ", extension_loaded($ext) ? "yes" : "no", PHP_EOL;'
fi
if command -v node >/dev/null 2>&1; then node --version; fi
if command -v psql >/dev/null 2>&1; then psql --version; fi

printf '\nRelated systemd units (installed units; active state follows)\n'
if command -v systemctl >/dev/null 2>&1; then
  units="$(systemctl list-unit-files --no-pager --no-legend 2>/dev/null | awk '$1 ~ /(dost|caraga|procurement|nginx|php.*fpm|postgresql|tailscale)/ { print $1, $2 }' || true)"
  printf '%s\n' "$units"
  while read -r unit enabled; do
    if [ -n "$unit" ]; then
      unit_state="$(systemctl is-active "$unit" 2>/dev/null || true)"
      printf '%s: %s\n' "$unit" "${unit_state:-unknown}"
    fi
  done <<< "$units"
fi

printf '\nListening TCP sockets\n'
if command -v ss >/dev/null 2>&1; then ss -ltn; fi

printf '\nProject path: %s\n' "$project_path"
if [ -d "$project_path" ]; then
  for relative_path in pr_backend/artisan pr_backend/.env pr_backend/vendor/autoload.php pr_frontend/package.json pr_frontend/dist/server/server.js; do
    if [ -e "$project_path/$relative_path" ]; then
      printf '%s: present\n' "$relative_path"
    else
      printf '%s: missing\n' "$relative_path"
    fi
  done
else
  printf 'Project directory not found; provide its actual path as the first script argument.\n'
fi
