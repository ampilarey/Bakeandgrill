<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Reads the deploy stamp written by scripts/pull-deploy-test.sh and scripts/full-deploy.sh.
 * File lives at storage/app/deploy-stamp.json — survives config:cache, no DB required.
 */
final class DeployStamp
{
    public const RELATIVE_PATH = 'deploy-stamp.json';

    /**
     * @return array{
     *   commit: string,
     *   commit_short: string,
     *   branch: string,
     *   deployed_at: string
     * }
     */
    public static function read(): array
    {
        $path = storage_path('app/'.self::RELATIVE_PATH);
        if (! is_file($path) || ! is_readable($path)) {
            return self::unknown();
        }

        try {
            $raw = file_get_contents($path);
            if ($raw === false || trim($raw) === '') {
                return self::unknown();
            }
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return self::unknown();
        }

        if (! is_array($data)) {
            return self::unknown();
        }

        $short = self::stringOrUnknown($data['commit_short'] ?? null);
        $full = self::stringOrUnknown($data['commit'] ?? null);
        if ($short === 'unknown' && $full !== 'unknown') {
            $short = substr($full, 0, 7);
        }

        return [
            'commit' => $full,
            'commit_short' => $short,
            'branch' => self::stringOrUnknown($data['branch'] ?? null),
            'deployed_at' => self::stringOrUnknown($data['deployed_at'] ?? null),
        ];
    }

    /** Short SHA only — for the public health endpoint. */
    public static function publicCommitShort(): string
    {
        return self::read()['commit_short'];
    }

    /**
     * @return array{
     *   commit: string,
     *   commit_short: string,
     *   branch: string,
     *   deployed_at: string
     * }
     */
    public static function unknown(): array
    {
        return [
            'commit' => 'unknown',
            'commit_short' => 'unknown',
            'branch' => 'unknown',
            'deployed_at' => 'unknown',
        ];
    }

    private static function stringOrUnknown(mixed $value): string
    {
        if (! is_string($value)) {
            return 'unknown';
        }
        $value = trim($value);

        return $value === '' ? 'unknown' : $value;
    }
}
