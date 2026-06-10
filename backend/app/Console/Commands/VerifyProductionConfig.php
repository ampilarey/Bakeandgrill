<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Validates production-critical environment configuration before go-live.
 * Exits non-zero when fatal misconfigurations are detected.
 */
class VerifyProductionConfig extends Command
{
    protected $signature = 'app:verify-production-config';

    protected $description = 'Verify required production environment configuration';

    public function handle(): int
    {
        if (!app()->environment('production')) {
            $this->info('Not production (' . config('app.env') . ') — skipping config verification.');

            return self::SUCCESS;
        }

        $failures = [];
        $warnings = [];

        if (config('app.debug')) {
            $failures[] = ['APP_DEBUG', 'Must be false in production'];
        }

        if (blank(config('app.key'))) {
            $failures[] = ['APP_KEY', 'Must be set'];
        }

        $trustedProxies = env('TRUSTED_PROXIES');
        if ($trustedProxies === null || trim((string) $trustedProxies) === '' || trim((string) $trustedProxies) === '*') {
            $failures[] = ['TRUSTED_PROXIES', 'Set explicit proxy IPs/CIDRs — never use * in production'];
        }

        if (blank(config('sentry.dsn'))) {
            $failures[] = ['SENTRY_LARAVEL_DSN', 'Backend error monitoring is not configured'];
        }

        $backupDisks = config('backup.backup.destination.disks', []);
        if (!is_array($backupDisks) || $backupDisks === []) {
            $failures[] = ['BACKUP_DISKS', 'No backup destination disks configured'];
        } elseif (
            $backupDisks === ['backups']
            && blank(env('AWS_ACCESS_KEY_ID'))
            && blank(env('AWS_BUCKET'))
        ) {
            $warnings[] = ['BACKUP_DISKS', 'Local-only backups — configure S3 (AWS_*) for off-server retention'];
        }

        if (config('queue.default') !== 'redis') {
            $failures[] = ['QUEUE_CONNECTION', 'Must be redis in production'];
        }

        if (config('cache.default') !== 'redis') {
            $failures[] = ['CACHE_STORE', 'Must be redis in production'];
        }

        if (blank(config('system.healthcheck_url'))) {
            $warnings[] = ['HEALTHCHECK_URL', 'Scheduler external heartbeat not configured'];
        }

        if (blank(env('ADMIN_TOKEN_TTL_HOURS'))) {
            $warnings[] = ['ADMIN_TOKEN_TTL_HOURS', 'Using default 24h — set explicitly if you need a different admin token TTL'];
        }

        $this->newLine();
        $this->components->info('Production configuration verification');

        if ($failures !== []) {
            $this->table(['Variable', 'Issue'], $failures);
        }

        if ($warnings !== []) {
            $this->components->warn('Warnings (non-fatal):');
            $this->table(['Variable', 'Note'], $warnings);
        }

        if ($failures === [] && $warnings === []) {
            $this->components->info('All required production checks passed.');

            return self::SUCCESS;
        }

        if ($failures !== []) {
            $this->components->error(count($failures) . ' fatal configuration issue(s) — deploy blocked.');

            return self::FAILURE;
        }

        $this->components->info('Required checks passed with ' . count($warnings) . ' warning(s).');

        return self::SUCCESS;
    }
}
