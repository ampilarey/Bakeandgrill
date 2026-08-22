<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RepointSignageQrUrlsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_rewrites_stored_playlist_qr_bindings_to_the_menu(): void
    {
        $playlistId = DB::table('signage_playlists')->insertGetId([
            'name' => 'Old QR Board',
            'slides' => json_encode([
                [
                    'name' => 'Scan',
                    'template_origin' => 'qr',
                    'elements' => [
                        ['type' => 'qr', 'binding' => ['url' => '/order/view']],
                        ['type' => 'text', 'text' => 'Leave this'],
                    ],
                ],
            ], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $campaignId = DB::table('signage_campaigns')->insertGetId([
            'name' => 'Old campaign',
            'slides' => json_encode([
                ['elements' => [['type' => 'qr', 'binding' => ['url' => 'https://bakeandgrill.mv/order/view']]]],
            ], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $migration = require database_path('migrations/2026_08_22_140000_repoint_signage_qr_urls_to_menu.php');
        $migration->up();

        $playlist = json_decode((string) DB::table('signage_playlists')->where('id', $playlistId)->value('slides'), true);
        $this->assertSame('/menu', $playlist[0]['elements'][0]['binding']['url']);
        $this->assertSame('Leave this', $playlist[0]['elements'][1]['text']);

        $campaign = json_decode((string) DB::table('signage_campaigns')->where('id', $campaignId)->value('slides'), true);
        $this->assertSame('https://bakeandgrill.mv/menu', $campaign[0]['elements'][0]['binding']['url']);
    }
}
