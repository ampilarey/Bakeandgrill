<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class BrandBackfillMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_backfill_reconciles_divergent_brand_rows_preferring_website(): void
    {
        SiteSetting::set('logo', '/storage/shared-old.png', 'shared');
        SiteSetting::set('logo', '/storage/website-new.png', 'website');
        SiteSetting::set('logo', '/storage/order-old.png', 'order_app');

        $migration = require database_path('migrations/2026_07_27_021100_backfill_brand_keys_across_scopes.php');
        $migration->up();

        $this->assertSame('/storage/website-new.png', SiteSetting::getScoped('logo', 'shared'));
        $this->assertSame('/storage/website-new.png', SiteSetting::getScoped('logo', 'website'));
        $this->assertSame('/storage/website-new.png', SiteSetting::getScoped('logo', 'order_app'));
    }
}
