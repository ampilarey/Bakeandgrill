<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use RegexIterator;
use Tests\TestCase;

/**
 * Guards ContentRegistry apps[] declarations against drift: every key offered
 * for an app must appear as a literal in that app's consumer code.
 */
class ContentAppScopeHygieneTest extends TestCase
{
    public function test_every_order_app_registry_key_is_consumed_in_order_src(): void
    {
        $corpus = $this->orderAppConsumerCorpus();
        $missing = [];
        foreach (ContentRegistry::keysForApp('order_app') as $key) {
            if (! str_contains($corpus, $key)) {
                $missing[] = $key;
            }
        }

        $this->assertSame(
            [],
            $missing,
            'Order-app registry keys with no consumer in apps/online-order-web/src: '.implode(', ', $missing),
        );
    }

    public function test_every_website_registry_key_is_consumed_in_blade_or_app(): void
    {
        $corpus = $this->websiteConsumerCorpus();
        $missing = [];
        foreach (ContentRegistry::keysForApp('website') as $key) {
            if (! str_contains($corpus, $key)) {
                $missing[] = $key;
            }
        }

        $this->assertSame(
            [],
            $missing,
            'Website registry keys with no consumer in backend/resources/views or backend/app: '.implode(', ', $missing),
        );
    }

    private function orderAppConsumerCorpus(): string
    {
        $root = base_path('../apps/online-order-web/src');
        $chunks = [];
        foreach ($this->iterateSourceFiles($root, ['php', 'ts', 'tsx', 'js', 'jsx', 'css']) as $path) {
            $base = basename($path);
            if (preg_match('/\.test\./', $base)) {
                continue;
            }
            $chunks[] = $this->stripSiteSettingsInterface(file_get_contents($path) ?: '');
        }

        return implode("\n", $chunks);
    }

    private function websiteConsumerCorpus(): string
    {
        $roots = [
            base_path('resources/views'),
            base_path('app'),
        ];
        $chunks = [];
        foreach ($roots as $root) {
            if (! is_dir($root)) {
                continue;
            }
            foreach ($this->iterateSourceFiles($root, ['php']) as $path) {
                $chunks[] = file_get_contents($path) ?: '';
            }
        }

        return implode("\n", $chunks);
    }

    /**
     * @param  list<string>  $extensions
     * @return list<string>
     */
    private function iterateSourceFiles(string $root, array $extensions): array
    {
        if (! is_dir($root)) {
            return [];
        }

        $extPattern = implode('|', array_map('preg_quote', $extensions));
        $iterator = new RegexIterator(
            new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root)),
            '/\.('.$extPattern.')$/i',
            RegexIterator::MATCH,
        );

        $paths = [];
        foreach ($iterator as $file) {
            /** @var \SplFileInfo $file */
            $paths[] = $file->getPathname();
        }
        sort($paths);

        return $paths;
    }

    /**
     * Drop the SiteSettings interface type-declaration block so keys listed
     * only as TypeScript types do not count as consumers.
     */
    private function stripSiteSettingsInterface(string $source): string
    {
        $needle = 'export interface SiteSettings';
        $start = strpos($source, $needle);
        if ($start === false) {
            $needle = 'interface SiteSettings';
            $start = strpos($source, $needle);
        }
        if ($start === false) {
            return $source;
        }

        $brace = strpos($source, '{', $start);
        if ($brace === false) {
            return $source;
        }

        $depth = 0;
        $len = strlen($source);
        for ($i = $brace; $i < $len; $i++) {
            $ch = $source[$i];
            if ($ch === '{') {
                $depth++;
            } elseif ($ch === '}') {
                $depth--;
                if ($depth === 0) {
                    return substr($source, 0, $start).substr($source, $i + 1);
                }
            }
        }

        return $source;
    }
}
