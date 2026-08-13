<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('dahonmd:backup {--keep=7 : Number of recent backups to retain}', function () {
    if (config('database.default') !== 'sqlite') {
        $this->error('This command currently supports SQLite only. Use your database provider backup tooling for other drivers.');

        return self::FAILURE;
    }

    $configuredPath = (string) config('database.connections.sqlite.database');
    $databasePath = str_starts_with($configuredPath, DIRECTORY_SEPARATOR)
        || preg_match('/^[A-Za-z]:[\\\\\/]/', $configuredPath)
        ? $configuredPath
        : base_path($configuredPath);

    if ($configuredPath === ':memory:' || ! File::isFile($databasePath)) {
        $this->error('The configured SQLite database file could not be found.');

        return self::FAILURE;
    }

    $keep = max(1, (int) $this->option('keep'));
    $backupDirectory = storage_path('app/private/backups');
    File::ensureDirectoryExists($backupDirectory);
    $backupPath = $backupDirectory.'/dahonmd-'.now()->format('Ymd-His-u').'.sqlite';

    try {
        $escapedBackupPath = str_replace("'", "''", $backupPath);
        DB::statement("VACUUM INTO '{$escapedBackupPath}'");
    } catch (Throwable $exception) {
        report($exception);
        $this->error('The database backup could not be created.');

        return self::FAILURE;
    }

    collect(File::files($backupDirectory))
        ->filter(fn ($file) => str_starts_with($file->getFilename(), 'dahonmd-') && $file->getExtension() === 'sqlite')
        ->sortByDesc(fn ($file) => $file->getMTime())
        ->slice($keep)
        ->each(fn ($file) => File::delete($file->getPathname()));

    $this->info("Backup created: {$backupPath}");

    return self::SUCCESS;
})->purpose('Create a retained local backup of the SQLite database');

Schedule::command('dahonmd:backup --keep=7')->dailyAt('02:00')->withoutOverlapping();
