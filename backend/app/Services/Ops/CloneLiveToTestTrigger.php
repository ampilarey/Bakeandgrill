<?php

declare(strict_types=1);

namespace App\Services\Ops;

use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Spawns scripts/clone-live-to-test-async.sh in the background (TEST install only).
 */
class CloneLiveToTestTrigger
{
    public function scriptPath(): string
    {
        return dirname(base_path()).'/scripts/clone-live-to-test.sh';
    }

    public function asyncScriptPath(): string
    {
        return dirname(base_path()).'/scripts/clone-live-to-test-async.sh';
    }

    public function homePath(): string
    {
        return (string) config('deploy.clone_live_to_test.home', '/home/bakeandgrill');
    }

    public function logPath(): string
    {
        return $this->homePath().'/clone-live-to-test.log';
    }

    public function statusPath(): string
    {
        return storage_path('app/clone-live-to-test-status.json');
    }

    public function lockPath(): string
    {
        return $this->homePath().'/.clone-live-to-test.lock';
    }

    public function scriptAvailable(): bool
    {
        return is_file($this->scriptPath()) && is_file($this->asyncScriptPath());
    }

    public function isRunning(): bool
    {
        if (is_dir($this->lockPath())) {
            return true;
        }

        return $this->readStatus()['state'] === 'running';
    }

    /**
     * @return array{state: string, started_at: ?string, finished_at: ?string, exit_code: ?int, message: ?string}
     */
    public function readStatus(): array
    {
        $defaults = [
            'state' => 'idle',
            'started_at' => null,
            'finished_at' => null,
            'exit_code' => null,
            'message' => null,
        ];

        $path = $this->statusPath();
        if (! is_file($path) || ! is_readable($path)) {
            return $defaults;
        }

        try {
            $raw = file_get_contents($path);
            if ($raw === false || trim($raw) === '') {
                return $defaults;
            }
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return $defaults;
        }

        if (! is_array($data)) {
            return $defaults;
        }

        $exit = $data['exit_code'] ?? null;
        if ($exit === 'null' || $exit === null || $exit === '') {
            $exitCode = null;
        } elseif (is_numeric($exit)) {
            $exitCode = (int) $exit;
        } else {
            $exitCode = null;
        }

        return [
            'state' => is_string($data['state'] ?? null) ? $data['state'] : 'idle',
            'started_at' => is_string($data['started_at'] ?? null) ? $data['started_at'] : null,
            'finished_at' => is_string($data['finished_at'] ?? null) ? $data['finished_at'] : null,
            'exit_code' => $exitCode,
            'message' => is_string($data['message'] ?? null) ? $data['message'] : null,
        ];
    }

    /**
     * @return array{ok: bool, message: string}
     */
    public function triggerAsync(): array
    {
        $script = $this->asyncScriptPath();
        if (! is_file($script)) {
            throw new RuntimeException('clone-live-to-test-async.sh not found at '.$script);
        }
        if (! is_file($this->scriptPath())) {
            throw new RuntimeException('clone-live-to-test.sh not found at '.$this->scriptPath());
        }

        if ($this->isRunning()) {
            return ['ok' => false, 'message' => 'A clone is already running'];
        }

        @chmod($script, 0755);
        @chmod($this->scriptPath(), 0755);

        $startedAt = now()->toIso8601String();
        file_put_contents(
            $this->statusPath(),
            json_encode([
                'state' => 'running',
                'started_at' => $startedAt,
                'finished_at' => null,
                'exit_code' => null,
                'message' => 'Clone started',
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n",
        );

        $log = $this->logPath();
        $home = $this->homePath();
        $status = $this->statusPath();

        $cmd = sprintf(
            'export HOME=%s CLONE_STATUS_FILE=%s; nohup bash %s >> %s 2>&1 &',
            escapeshellarg($home),
            escapeshellarg($status),
            escapeshellarg($script),
            escapeshellarg($log),
        );

        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $process = @proc_open($cmd, $descriptors, $pipes, dirname($script));
        if (! is_resource($process)) {
            Log::error('clone-live-to-test trigger failed to spawn', ['cmd' => $cmd]);

            return ['ok' => false, 'message' => 'Unable to spawn clone process (proc_open blocked?)'];
        }

        foreach ($pipes as $pipe) {
            if (is_resource($pipe)) {
                fclose($pipe);
            }
        }
        proc_close($process);

        Log::info('clone-live-to-test triggered', [
            'log' => $log,
            'status' => $status,
        ]);

        return ['ok' => true, 'message' => 'Clone started — TEST database and photos will refresh from LIVE'];
    }

    public function logTail(int $lines = 40): string
    {
        $path = $this->logPath();
        if (! is_file($path) || ! is_readable($path)) {
            return '';
        }

        $content = @file($path, FILE_IGNORE_NEW_LINES);
        if (! is_array($content) || $content === []) {
            return '';
        }

        return implode("\n", array_slice($content, -$lines));
    }
}
