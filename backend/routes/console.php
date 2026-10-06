<?php

use App\Models\Diagnosis;
use App\Services\DiagnosisService;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

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

Artisan::command('dahonmd:delete-scans-without-photo {--dry-run : List the scans without deleting them}', function (DiagnosisService $diagnoses) {
    // A scan is only useful to an agriculturist with its photo; these records have none on the server.
    $missing = Diagnosis::query()->with('user:id,name')->orderBy('id')->get()->filter(
        fn (Diagnosis $diagnosis) => ! $diagnosis->image_path
            || (! Storage::disk('local')->exists($diagnosis->image_path) && ! Storage::disk('public')->exists($diagnosis->image_path)),
    );
    if ($missing->isEmpty()) {
        $this->info('Every scan has its photo. Nothing to delete.');

        return self::SUCCESS;
    }

    $this->table(['ID', 'Farmer', 'Result', 'Scanned'], $missing->map(fn (Diagnosis $diagnosis) => [
        $diagnosis->id, $diagnosis->user?->name ?? '—', $diagnosis->predicted_class, $diagnosis->diagnosed_at?->toDateTimeString(),
    ]));
    if ($this->option('dry-run')) {
        $this->info("{$missing->count()} scan(s) without a photo would be deleted.");

        return self::SUCCESS;
    }

    $deleted = 0;
    foreach ($missing as $diagnosis) {
        try {
            // The service soft-deletes and records a sync tombstone, so phones remove the scan too.
            $diagnoses->delete($diagnosis);
            $deleted++;
        } catch (ValidationException $exception) {
            $this->warn("Scan {$diagnosis->id} kept: ".collect($exception->errors())->flatten()->first());
        }
    }
    $this->info("Deleted {$deleted} scan(s) without a photo.");

    return self::SUCCESS;
})->purpose('Delete saved scans whose photo never reached the server');

Schedule::command('dahonmd:backup --keep=7')->dailyAt('02:00')->withoutOverlapping();
