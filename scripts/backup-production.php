<?php

declare(strict_types=1);

use Illuminate\Contracts\Console\Kernel;

$backendPath = $argv[1] ?? null;
$backupDirectory = $argv[2] ?? null;

if (! is_string($backendPath) || ! is_dir($backendPath) || ! is_string($backupDirectory)) {
    fwrite(STDERR, "Usage: php backup-production.php BACKEND_PATH BACKUP_DIRECTORY\n");
    exit(2);
}

require $backendPath.'/vendor/autoload.php';
$app = require $backendPath.'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

$connectionName = (string) config('database.default');
$connection = config("database.connections.{$connectionName}");

if (! is_array($connection) || ($connection['driver'] ?? null) !== 'pgsql') {
    fwrite(STDERR, "Production backups currently require the configured database driver to be pgsql.\n");
    exit(2);
}

if (! is_dir($backupDirectory) && ! mkdir($backupDirectory, 0700, true) && ! is_dir($backupDirectory)) {
    fwrite(STDERR, "Unable to create backup directory.\n");
    exit(1);
}

chmod($backupDirectory, 0700);

$timestamp = gmdate('Ymd-His');
$database = (string) ($connection['database'] ?? '');
$username = (string) ($connection['username'] ?? '');
$backupPath = rtrim($backupDirectory, '/')."/database-{$timestamp}.dump";

if ($database === '' || $username === '') {
    fwrite(STDERR, "The configured database name and username are required.\n");
    exit(2);
}

$command = [
    'pg_dump',
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file='.$backupPath,
    '--username='.$username,
];

$host = (string) ($connection['host'] ?? '');
$port = (string) ($connection['port'] ?? '');

if ($host !== '') {
    $command[] = '--host='.$host;
}

if ($port !== '') {
    $command[] = '--port='.$port;
}

$command[] = $database;

$environment = getenv();
$environment['PGPASSWORD'] = (string) ($connection['password'] ?? '');

$process = proc_open(
    $command,
    [STDIN, ['pipe', 'w'], ['pipe', 'w']],
    $pipes,
    $backendPath,
    $environment,
);

if (! is_resource($process)) {
    fwrite(STDERR, "Unable to start pg_dump.\n");
    exit(1);
}

$standardOutput = stream_get_contents($pipes[1]);
$standardError = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$exitCode = proc_close($process);

if ($exitCode !== 0) {
    @unlink($backupPath);
    fwrite(STDERR, $standardError !== '' ? $standardError : "pg_dump failed.\n");
    exit($exitCode);
}

if ($standardOutput !== '') {
    fwrite(STDOUT, $standardOutput);
}

chmod($backupPath, 0600);
fwrite(STDOUT, $backupPath."\n");
