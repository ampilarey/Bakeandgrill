<?php

declare(strict_types=1);

namespace App\Domains\System;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Spatie\Backup\BackupDestination\BackupDestination;
use Symfony\Component\Process\Process;
use Throwable;
use ZipArchive;

/**
 * The monthly backup restore drill (iruali import plan, feature 15): a backup
 * that has never been restored is a hope, not a backup.
 *
 * It takes the newest backup, restores its database dump into the empty drill
 * database (BACKUP_DRILL_DATABASE), counts the rows of the tables that matter
 * against the live ones, empties the drill database again and keeps the result
 * in the site setting ReadyChecks::DRILL_SETTING. The live database is only
 * ever read. The drill database must not be the live one; the drill refuses.
 */
class RestoreDrill
{
    /** The tables whose rows must come back. */
    public const TABLES = ['orders', 'order_items', 'customers', 'items', 'payments'];

    public const CONNECTION = 'restore_drill';

    /**
     * @return array{status: string, detail: string, at: string, backup: ?string, tables: array<string, array{live: int, restored: ?int}>}
     */
    public function run(): array
    {
        $result = ['status' => 'fail', 'detail' => '', 'at' => now()->toIso8601String(), 'backup' => null, 'tables' => []];
        $database = trim((string) config('system.restore_drill_database'));
        $live = config('database.default');
        $liveName = (string) config("database.connections.{$live}.database");

        if ($database === '') {
            return $this->keep(['status' => 'skipped', 'detail' => 'BACKUP_DRILL_DATABASE is not set.'] + $result);
        }
        if ($database === $liveName) {
            return $this->keep(['detail' => 'BACKUP_DRILL_DATABASE is the live database; the drill will not touch it.'] + $result);
        }

        $dump = null;
        try {
            [$backupPath, $dump] = $this->newestDump();
            $result['backup'] = $backupPath;
            $this->connect($database);
            $this->empty();
            $this->restore($dump, $database);

            $short = [];
            foreach (self::TABLES as $table) {
                $liveCount = Schema::hasTable($table) ? (int) DB::table($table)->count() : 0;
                $restored = Schema::connection(self::CONNECTION)->hasTable($table) ? (int) DB::connection(self::CONNECTION)->table($table)->count() : null;
                $result['tables'][$table] = ['live' => $liveCount, 'restored' => $restored];
                // The backup is up to a day old, so it may hold fewer rows than
                // live, never none of a table live has, and never more.
                if ($restored === null || ($liveCount > 0 && $restored === 0) || $restored > $liveCount) {
                    $short[] = $table . ' (' . ($restored ?? 'missing') . ' of ' . $liveCount . ')';
                }
            }
            $result['status'] = $short === [] ? 'pass' : 'fail';
            $result['detail'] = $short === []
                ? 'The newest backup restored and every key table came back.'
                : 'Restored, but these tables did not come back right: ' . implode(', ', $short) . '.';
        } catch (Throwable $e) {
            $result['detail'] = $e->getMessage();
        } finally {
            try {
                $this->empty();
            } catch (Throwable) {
                // Nothing more to do; the next drill empties it first.
            }
            if (is_string($dump) && str_starts_with($dump, sys_get_temp_dir()) && is_file($dump)) {
                @unlink($dump);
            }
            DB::purge(self::CONNECTION);
        }

        return $this->keep($result);
    }

    /**
     * The newest backup's path and its database dump unzipped to a temporary file.
     *
     * @return array{0: string, 1: string}
     */
    protected function newestDump(): array
    {
        $disk = (string) (config('backup.backup.destination.disks')[0] ?? 'backups');
        $backup = BackupDestination::create($disk, (string) config('backup.backup.name'))->newestBackup();
        if ($backup === null) {
            throw new RuntimeException("No backup found on the \"{$disk}\" disk.");
        }
        $zipFile = tempnam(sys_get_temp_dir(), 'drill-zip-');
        file_put_contents($zipFile, $backup->disk()->get($backup->path()));
        $zip = new ZipArchive;
        if ($zip->open($zipFile) !== true) {
            @unlink($zipFile);
            throw new RuntimeException('The newest backup is not a readable zip file.');
        }
        $entry = null;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            if (preg_match('#db-dumps/.+\.sql(\.gz)?$#', $name)) {
                $entry = $name;
                break;
            }
        }
        if ($entry === null) {
            $zip->close();
            @unlink($zipFile);
            throw new RuntimeException('The newest backup has no database dump in it.');
        }
        $sql = tempnam(sys_get_temp_dir(), 'drill-sql-');
        $contents = (string) $zip->getFromName($entry);
        $zip->close();
        @unlink($zipFile);
        file_put_contents($sql, str_ends_with($entry, '.gz') ? (string) gzdecode($contents) : $contents);

        return [$backup->path(), $sql];
    }

    /** Load the dump into the drill database with the mysql client. */
    protected function restore(string $dump, string $database): void
    {
        $c = config('database.connections.' . config('database.default'));
        $args = ['mysql', '--host=' . ($c['host'] ?? '127.0.0.1'), '--port=' . ($c['port'] ?? 3306), '--user=' . ($c['username'] ?? ''), $database];
        if (!empty($c['unix_socket'])) {
            $args[] = '--socket=' . $c['unix_socket'];
        }
        $process = new Process($args, null, ['MYSQL_PWD' => (string) ($c['password'] ?? '')], fopen($dump, 'rb'), 1800);
        $process->run();
        if (!$process->isSuccessful()) {
            throw new RuntimeException('The dump did not load: ' . trim($process->getErrorOutput() ?: $process->getOutput()));
        }
    }

    /** A connection to the drill database: the live one with its name swapped. */
    protected function connect(string $database): void
    {
        $base = config('database.connections.' . config('database.default'));
        config(['database.connections.' . self::CONNECTION => array_merge($base, ['database' => $database])]);
        DB::purge(self::CONNECTION);
    }

    /** Drop every table in the drill database. */
    protected function empty(): void
    {
        if (config('database.connections.' . self::CONNECTION) === null) {
            return;
        }
        $schema = Schema::connection(self::CONNECTION);
        $schema->disableForeignKeyConstraints();
        foreach ($schema->getTableListing(null, false) as $table) {
            $schema->drop($table);
        }
        $schema->enableForeignKeyConstraints();
    }

    /** @param array<string, mixed> $result */
    private function keep(array $result): array
    {
        SiteSetting::set(ReadyChecks::DRILL_SETTING, (string) json_encode($result, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $result;
    }
}
