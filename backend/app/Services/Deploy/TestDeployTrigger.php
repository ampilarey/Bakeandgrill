<?php

declare(strict_types=1);

namespace App\Services\Deploy;

use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Spawns the TEST pull-deploy script in the background (cPanel-safe nohup).
 */
class TestDeployTrigger
{
    public function scriptPath(): string
    {
        return dirname(base_path()) . '/scripts/pull-deploy-test.sh';
    }

    public function logPath(): string
    {
        $home = getenv('HOME') ?: ('/home/' . get_current_user());

        return rtrim((string) $home, '/') . '/self-update-test.log';
    }

    /**
     * @return array{ok: bool, message: string}
     */
    public function triggerAsync(?string $expectedSha = null): array
    {
        $script = $this->scriptPath();
        if (! is_file($script)) {
            throw new RuntimeException('pull-deploy-test.sh not found at ' . $script);
        }

        if (! is_executable($script)) {
            @chmod($script, 0755);
        }

        $log = $this->logPath();
        $shaArg = ($expectedSha !== null && preg_match('/^[0-9a-f]{40}$/i', $expectedSha) === 1)
            ? escapeshellarg($expectedSha)
            : '';

        $cmd = sprintf(
            'nohup bash %s %s >> %s 2>&1 &',
            escapeshellarg($script),
            $shaArg,
            escapeshellarg($log),
        );

        // Prefer proc_open — some cPanel profiles disable shell_exec/exec.
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ];
        $process = @proc_open($cmd, $descriptors, $pipes, dirname($script));
        if (! is_resource($process)) {
            Log::error('TEST deploy trigger failed to spawn process', ['cmd' => $cmd]);

            return ['ok' => false, 'message' => 'Unable to spawn deploy process (proc_open blocked?)'];
        }

        foreach ($pipes as $pipe) {
            if (is_resource($pipe)) {
                fclose($pipe);
            }
        }
        proc_close($process);

        Log::info('TEST deploy triggered', [
            'expected_sha' => $expectedSha,
            'log' => $log,
        ]);

        return ['ok' => true, 'message' => 'Deploy started'];
    }
}
