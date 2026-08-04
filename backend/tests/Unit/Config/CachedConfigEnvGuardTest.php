<?php

declare(strict_types=1);

namespace Tests\Unit\Config;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Guards against config:cache silent breakage: values that must be read via
 * config() (never env() in app/) and that the media/system keys resolve.
 */
class CachedConfigEnvGuardTest extends TestCase
{
    #[Test]
    public function media_and_system_keys_resolve_under_config_cache_style_loading(): void
    {
        // Real config files are loaded at boot — keys must exist even before overrides.
        $this->assertIsString(config('media.ffmpeg_path'));
        $this->assertIsString(config('media.ffprobe_path'));
        $this->assertIsBool(config('system.otp_dev_return'));
        $this->assertArrayHasKey('allow_staff_cli_create', config('system'));

        // Simulate a cached config bag: values written at cache time are readable
        // via config() (the call-site contract after config:cache).
        config([
            'media.ffmpeg_path' => '/usr/bin/ffmpeg',
            'media.ffprobe_path' => '/usr/bin/ffprobe',
            'system.otp_dev_return' => true,
        ]);

        $this->assertSame('/usr/bin/ffmpeg', config('media.ffmpeg_path'));
        $this->assertSame('/usr/bin/ffprobe', config('media.ffprobe_path'));
        $this->assertTrue((bool) config('system.otp_dev_return'));
    }

    #[Test]
    public function app_directory_has_no_env_calls_outside_allow_list(): void
    {
        // Allow-list: paths (relative to backend/app/) that may still call env().
        // Keep this empty — new env() in app/ must go through a config/*.php file.
        // putenv() in PrayerImport is intentionally not matched (different call).
        $allowList = [
            // Intentionally empty. Add a path here only with a comment explaining
            // why config() cannot be used (bootstrap timing is NOT a reason —
            // that belongs in config/*.php + bootstrap reading config()).
        ];

        $appRoot = dirname(__DIR__, 3).'/app';
        $this->assertDirectoryExists($appRoot);

        $violations = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($appRoot, \FilesystemIterator::SKIP_DOTS),
        );

        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            $absolute = $file->getPathname();
            $relative = ltrim(str_replace($appRoot, '', $absolute), DIRECTORY_SEPARATOR);
            $relative = str_replace('\\', '/', $relative);

            if (in_array($relative, $allowList, true)) {
                continue;
            }

            $contents = (string) file_get_contents($absolute);
            // Strip block + line comments so prose like "never env()" does not trip the guard.
            $stripped = preg_replace('/\/\*.*?\*\//s', '', $contents) ?? $contents;
            $stripped = preg_replace('/\/\/[^\n]*/', '', $stripped) ?? $stripped;
            // Match env( but not putenv(
            if (preg_match('/(?<!put)env\s*\(/', $stripped) === 1) {
                $violations[] = $relative;
            }
        }

        $this->assertSame(
            [],
            $violations,
            "env() found in app/ outside the allow-list. Move the value into config/*.php and read via config(). Offenders: ".implode(', ', $violations),
        );
    }
}
