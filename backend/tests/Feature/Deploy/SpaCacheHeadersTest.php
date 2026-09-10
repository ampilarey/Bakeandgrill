<?php

declare(strict_types=1);

namespace Tests\Feature\Deploy;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The cache rules each built SPA ships with, checked without Apache.
 *
 * `public/pos/.htaccess` pinned `sw.js` as immutable for a year. Not by
 * anybody's intent — the file's own header said shell files must revalidate
 * quickly on an iPad — but because two `<FilesMatch>` blocks both matched it
 * and mod_headers lets whichever comes last win. The order app had the same
 * two rules in the opposite order and a comment explaining that the order was
 * load-bearing. One copy of that reasoning was wrong.
 *
 * The rules are keyed on Vite's content hash now, so the two cannot both match
 * the same file and their order stops mattering. This is what holds that: it
 * reads the real .htaccess files and the real build output and checks the
 * classification, so a rule that starts overlapping again fails here rather
 * than on somebody's till.
 */
class SpaCacheHeadersTest extends TestCase
{
    /** Every SPA served out of backend/public, and the shell files it must never pin. */
    private const APPS = [
        'admin' => ['index.html', 'theme-init.js'],
        'order' => ['index.html', 'sw.js'],
        'pos' => ['index.html', 'sw.js'],
        'kds' => ['index.html'],
        'driver' => ['index.html', 'sw.js', 'registerSW.js'],
    ];

    private function publicPath(string $app): string
    {
        return base_path("public/{$app}");
    }

    /**
     * The two `<FilesMatch>` patterns, as PCRE.
     *
     * @return array{immutable: string, revalidate: string}
     */
    private function rules(string $app): array
    {
        $htaccess = $this->publicPath($app) . '/.htaccess';
        $this->assertFileExists(
            $htaccess,
            "{$app} has no .htaccess, so its shell is cached on the browser's guess and its "
            . 'content-hashed assets are re-validated on every load.',
        );

        $body = (string) file_get_contents($htaccess);
        preg_match_all('/<FilesMatch\s+"([^"]+)">(.*?)<\/FilesMatch>/s', $body, $blocks, PREG_SET_ORDER);
        $this->assertCount(2, $blocks, "Expected exactly two FilesMatch blocks in {$app}/.htaccess.");

        $rules = [];
        foreach ($blocks as [, $pattern, $inner]) {
            $key = str_contains($inner, 'immutable') ? 'immutable' : 'revalidate';
            $rules[$key] = '/' . str_replace('/', '\/', $pattern) . '/';
        }

        $this->assertArrayHasKey('immutable', $rules, "{$app}/.htaccess has no immutable rule.");
        $this->assertArrayHasKey('revalidate', $rules, "{$app}/.htaccess has no no-cache rule.");

        return $rules;
    }

    /** @return list<string> every file the app ships, relative names only */
    private function shippedFiles(string $app): array
    {
        $dir = $this->publicPath($app);
        $files = [];
        $walk = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($walk as $file) {
            if ($file->isFile() && $file->getFilename() !== '.htaccess') {
                $files[] = $file->getFilename();
            }
        }

        return array_values(array_unique($files));
    }

    /** @return list<string> */
    public static function appProvider(): array
    {
        return array_map(static fn (string $app) => [$app], array_keys(self::APPS));
    }

    #[DataProvider('appProvider')]
    public function test_no_file_is_both_cached_forever_and_told_to_revalidate(string $app): void
    {
        $rules = $this->rules($app);

        foreach ($this->shippedFiles($app) as $file) {
            $both = preg_match($rules['immutable'], $file) === 1
                 && preg_match($rules['revalidate'], $file) === 1;

            $this->assertFalse(
                $both,
                "{$app}/{$file} matches both cache rules. mod_headers takes whichever block "
                . 'comes last, so the answer depends on the order of two rules in a file '
                . 'nobody reads. Key the immutable rule on the content hash instead.',
            );
        }
    }

    #[DataProvider('appProvider')]
    public function test_the_shell_is_never_pinned(string $app): void
    {
        $rules = $this->rules($app);
        $shipped = $this->shippedFiles($app);

        foreach (self::APPS[$app] as $shellFile) {
            if (!in_array($shellFile, $shipped, true)) {
                // Not every app has a service worker; only check what it ships.
                continue;
            }

            $this->assertSame(
                0,
                preg_match($rules['immutable'], $shellFile),
                "{$app}/{$shellFile} would be served immutable. It carries no content hash, so "
                . 'the name never changes and a browser holding it has no way to learn there is '
                . 'a newer build.',
            );
            $this->assertSame(
                1,
                preg_match($rules['revalidate'], $shellFile),
                "{$app}/{$shellFile} is not in the no-cache list, so it is cached on the "
                . "browser's own guess after a deploy.",
            );
        }
    }

    #[DataProvider('appProvider')]
    public function test_every_hashed_asset_is_cached_forever(string $app): void
    {
        $rules = $this->rules($app);
        $assets = $this->publicPath($app) . '/assets';
        $this->assertDirectoryExists($assets, "{$app} has no assets directory — has it been built?");

        $files = array_values(array_diff(scandir($assets) ?: [], ['.', '..']));
        $this->assertNotEmpty($files, "{$app}/assets is empty.");

        foreach ($files as $file) {
            if (!preg_match('/\.(js|css)$/', $file)) {
                continue; // fonts, images and source maps are not the point here
            }
            $this->assertSame(
                1,
                preg_match($rules['immutable'], $file),
                "{$app}/assets/{$file} is not cached. Its name changes whenever its contents do, "
                . 'so re-fetching it on every load buys nothing.',
            );
        }
    }
}
