import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.join(root, "pr_frontend");
const backend = path.join(root, "pr_backend");
const missing = [];

if (!existsSync(path.join(frontend, "node_modules"))) missing.push("frontend packages");
if (!existsSync(path.join(backend, "vendor", "autoload.php"))) missing.push("backend Composer packages");
if (!existsSync(path.join(backend, ".env"))) missing.push("backend environment");

if (missing.length) {
  console.error(`Missing ${missing.join(", ")}. Run "npm run setup" first.`);
  process.exit(1);
}

const processes = [
  spawn("php", ["artisan", "serve", "--host=127.0.0.1", "--port=8000"], {
    cwd: backend,
    stdio: "inherit",
  }),
  spawn("npm", ["run", "dev"], {
    cwd: frontend,
    stdio: "inherit",
  }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 250);
}

for (const child of processes) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`A development service stopped (${signal ?? `exit ${code ?? 1}`}).`);
      stop(code ?? 1);
    }
  });
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
