<?php

declare(strict_types=1);

namespace Tests;

/**
 * Snapshot-based API contract testing.
 *
 * Usage:
 *   $this->assertMatchesApiSnapshot($response, 'order.create');
 *
 * On first run (no snapshot file), the snapshot is WRITTEN and the test passes.
 * On subsequent runs, the response is compared to the stored snapshot.
 * Set UPDATE_SNAPSHOTS=true env var to regenerate all snapshots.
 */
trait SnapshotHelper
{
    /**
     * Fields that change between runs — strip these before comparing.
     * Add domain-specific volatile keys by overriding $snapshotVolatileKeys in your test.
     */
    protected array $snapshotVolatileKeys = [
        'id',
        'order_id',
        'printer_id',
        'customer_id',
        'user_id',
        'device_id',
        'token',
        'idempotency_key',
        'hold_key',
        'created_at',
        'updated_at',
        'deleted_at',
        'processed_at',
        'sent_at',
        'last_sent_at',
        'completed_at',
        'held_at',
        'paid_at',
        'opened_at',
        'closed_at',
        'expires_at',
        'consumed_at',
        'released_at',
        'password',
        'remember_token',
        'last_order_at',
    ];

    public function assertMatchesApiSnapshot(
        \Illuminate\Testing\TestResponse $response,
        string $snapshotName,
    ): void {
        $actual = $this->normalizeForSnapshot($response->json());
        $snapshotPath = $this->snapshotPath($snapshotName);

        if (file_exists($snapshotPath) && !$this->shouldUpdateSnapshots()) {
            $expected = json_decode(file_get_contents($snapshotPath), true);
            $this->assertEquals(
                $expected,
                $actual,
                "API contract snapshot mismatch for [{$snapshotName}].\n" .
                'Run with UPDATE_SNAPSHOTS=true to regenerate.',
            );
        } else {
            file_put_contents($snapshotPath, json_encode($actual, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $this->assertTrue(true, "Snapshot [{$snapshotName}] written.");
        }
    }

    public function normalizeForSnapshot(mixed $data): mixed
    {
        if (!is_array($data)) {
            return $data;
        }

        $result = [];
        foreach ($data as $key => $value) {
            if (in_array($key, $this->snapshotVolatileKeys, true)) {
                $result[$key] = is_null($value) ? null : '__VOLATILE__';
            } elseif (is_array($value)) {
                $result[$key] = $this->normalizeForSnapshot($value);
            } else {
                $result[$key] = $value;
            }
        }

        return $result;
    }

    private function snapshotPath(string $name): string
    {
        $dir = base_path('tests/snapshots');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir . '/' . $name . '.json';
    }

    private function shouldUpdateSnapshots(): bool
    {
        return env('UPDATE_SNAPSHOTS', false) === true
            || env('UPDATE_SNAPSHOTS', 'false') === 'true';
    }
}
