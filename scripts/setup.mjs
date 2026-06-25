import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontend = path.join(root, "pr_frontend");
const backend = path.join(root, "pr_backend");
const backendEnv = path.join(backend, ".env");
const databaseName = "dost_caraga_pr";
const testDatabaseName = "dost_caraga_pr_test";

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, stdio: "inherit" });

  if (result.error) {
    console.error(`Unable to run ${executable}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) process.exit(result.status ?? 1);
}

command("npm", ["install"], frontend);
command("composer", ["install", "--no-interaction"], backend);

if (!existsSync(backendEnv)) {
  copyFileSync(path.join(backend, ".env.example"), backendEnv);
}

const phpHasSqlite =
  spawnSync("php", ["-r", "exit(extension_loaded('pdo_sqlite') ? 0 : 1);"]).status === 0;

if (!phpHasSqlite) {
  const databaseUser = process.env.USER;

  if (!databaseUser) {
    console.error("Unable to determine the local PostgreSQL user.");
    process.exit(1);
  }

  const databaseExists = spawnSync(
    "psql",
    ["-d", "postgres", "-Atqc", "select 1 from pg_database where datname='" + databaseName + "'"],
    { encoding: "utf8" },
  );

  if (databaseExists.status !== 0) {
    console.error(databaseExists.stderr || "Unable to connect to local PostgreSQL.");
    process.exit(1);
  }

  if (databaseExists.stdout.trim() !== "1") {
    command("createdb", ["--owner", databaseUser, databaseName], root);
  }

  const testDatabaseExists = spawnSync(
    "psql",
    ["-d", "postgres", "-Atqc", "select 1 from pg_database where datname='" + testDatabaseName + "'"],
    { encoding: "utf8" },
  );

  if (testDatabaseExists.status !== 0) {
    console.error(testDatabaseExists.stderr || "Unable to inspect the PostgreSQL test database.");
    process.exit(1);
  }

  if (testDatabaseExists.stdout.trim() !== "1") {
    command("createdb", ["--owner", databaseUser, testDatabaseName], root);
  }

  const env = readFileSync(backendEnv, "utf8")
    .replace(/^DB_CONNECTION=.*/m, "DB_CONNECTION=pgsql")
    .replace(/^#? ?DB_HOST=.*/m, "DB_HOST=/var/run/postgresql")
    .replace(/^#? ?DB_PORT=.*/m, "DB_PORT=5432")
    .replace(/^#? ?DB_DATABASE=.*/m, "DB_DATABASE=" + databaseName)
    .replace(/^#? ?DB_USERNAME=.*/m, "DB_USERNAME=" + databaseUser)
    .replace(/^#? ?DB_PASSWORD=.*/m, "DB_PASSWORD=");

  writeFileSync(backendEnv, env);
}

if (/^APP_KEY=\s*$/m.test(readFileSync(backendEnv, "utf8"))) {
  command("php", ["artisan", "key:generate"], backend);
}
command("php", ["artisan", "migrate", "--seed", "--force"], backend);

console.log("\nSetup complete. Run \"npm run dev\" from the repository root.");
