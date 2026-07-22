<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Database\Seeders\ContentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ContentBackfillTest extends TestCase
{
    use RefreshDatabase;

    public function test_existing_rows_become_shared_scope(): void
    {
        $this->assertTrue(Schema::hasColumn('site_settings', 'scope'));

        SiteSetting::query()->updateOrCreate(
            ['key' => 'business_phone', 'scope' => 'shared'],
            [
                'value' => '+960 912 0011',
                'type' => 'text',
                'group' => 'Contact',
                'label' => 'Phone',
                'is_public' => false,
            ],
        );

        $this->assertSame('shared', SiteSetting::query()->where('key', 'business_phone')->value('scope'));
        $this->assertSame('+960 912 0011', SiteSetting::get('business_phone'));
    }

    public function test_public_backfill_fixes_divergence_without_changing_values(): void
    {
        SiteSetting::query()->updateOrCreate(
            ['key' => 'home_categories_title', 'scope' => 'shared'],
            [
                'value' => 'Our favourites',
                'type' => 'text',
                'group' => 'Homepage',
                'label' => 'Categories Title',
                'is_public' => false,
            ],
        );

        $publicKeys = ContentRegistry::publicKeys();
        $this->assertContains('home_categories_title', $publicKeys);

        DB::table('site_settings')
            ->whereIn('key', $publicKeys)
            ->where('scope', 'shared')
            ->update(['is_public' => true]);

        $row = SiteSetting::query()->where('key', 'home_categories_title')->where('scope', 'shared')->first();
        $this->assertTrue((bool) $row->is_public);
        $this->assertSame('Our favourites', $row->value);

        SiteSetting::bust();
        ContentResolver::bust();
        $map = ContentResolver::for('order_app')->allPublic();
        $this->assertSame('Our favourites', $map['home_categories_title'] ?? null);
    }

    public function test_content_seeder_is_idempotent_and_does_not_overwrite(): void
    {
        SiteSetting::set('site_name', 'Keep Me', 'shared');
        $this->seed(ContentSeeder::class);
        $this->seed(ContentSeeder::class);
        $this->assertSame('Keep Me', SiteSetting::get('site_name'));
    }

    public function test_site_setting_get_remains_shared_back_compat(): void
    {
        SiteSetting::set('proof_stat', '999+', 'shared');
        SiteSetting::set('proof_stat', 'WEB', 'website');
        $this->assertSame('999+', SiteSetting::get('proof_stat', 'fallback'));
    }
}
