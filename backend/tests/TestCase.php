<?php

declare(strict_types=1);

namespace Tests;

use App\Support\DeferAfterResponse;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\ParallelTesting;
use Tests\Helpers\ModelHelpers;

abstract class TestCase extends BaseTestCase
{
    use ModelHelpers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->giveDompdfItsOwnFontFolder();
    }

    /**
     * Each parallel test process gets its own dompdf font folder. dompdf keeps
     * the fonts it has prepared in one installed-fonts.json beside their
     * metrics; four processes rewriting that one file at once left entries
     * pointing at metrics another process had not written yet, and every
     * label PDF test failed with "fopen(…labelj4_normal_….ufm): No such file".
     * The poster renderer's TCPDF font cache (posters.font_cache) is split the
     * same way, and so are its export zips (posters.export_dir): every process's
     * first export is id 1, and four writing exports/1.zip at once left a test
     * opening another process's zip (PosterMakeTest, PosterShopTest).
     */
    private function giveDompdfItsOwnFontFolder(): void
    {
        $token = ParallelTesting::token();
        if ($token === false || $token === null || $token === '') {
            return;
        }
        $dir = storage_path('fonts/test-worker-' . $token);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        config(['dompdf.options.font_dir' => $dir, 'dompdf.options.font_cache' => $dir]);
        config(['posters.font_cache' => storage_path('app/posters/fonts/test-worker-' . $token)]);
        config(['posters.export_dir' => storage_path('app/posters/exports/test-worker-' . $token)]);
    }

    /**
     * Mirror production: deferred domain work runs after the HTTP response.
     */
    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $response = parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
        DeferAfterResponse::flushTestingCallbacks();

        return $response;
    }
}
