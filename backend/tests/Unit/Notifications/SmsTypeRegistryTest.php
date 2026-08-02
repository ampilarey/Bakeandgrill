<?php

declare(strict_types=1);

namespace Tests\Unit\Notifications;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use Database\Seeders\SmsTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SmsTypeRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_entry_has_valid_category_and_unique_key(): void
    {
        $keys = [];
        $validCategories = ['auth', 'transactional', 'marketing', 'staff', 'system'];

        foreach (SmsTypeRegistry::all() as $entry) {
            $this->assertNotEmpty($entry['key']);
            $this->assertNotContains($entry['key'], $keys, 'Duplicate registry key: ' . $entry['key']);
            $keys[] = $entry['key'];
            $this->assertContains($entry['category'], $validCategories, $entry['key']);
            $this->assertIsBool($entry['always_on']);
            $this->assertIsBool($entry['suppressible']);
            $this->assertIsBool($entry['default_enabled']);
            $this->assertIsBool($entry['user_initiated']);
            $this->assertNotEmpty($entry['recipients'], $entry['key'] . ' missing recipients descriptor');
        }

        $this->assertNotEmpty($keys);
    }

    public function test_template_slugs_exist_in_seeder_when_set(): void
    {
        (new SmsTemplateSeeder)->run();

        $seeded = DB::table('sms_templates')->pluck('slug')->all();

        foreach (SmsTypeRegistry::all() as $entry) {
            if ($entry['template_slug'] === null) {
                continue;
            }
            $this->assertContains(
                $entry['template_slug'],
                $seeded,
                "Missing template slug {$entry['template_slug']} for {$entry['key']}",
            );
        }
    }

    public function test_enabled_settings_are_non_empty_strings_when_present(): void
    {
        foreach (SmsTypeRegistry::all() as $entry) {
            if ($entry['always_on']) {
                $this->assertNull($entry['enabled_setting'], $entry['key'] . ' always_on should not have a toggle');
                continue;
            }
            if ($entry['enabled_setting'] !== null) {
                $this->assertNotSame('', $entry['enabled_setting']);
            }
        }
    }

    public function test_resolve_maps_legacy_aliases_and_category_fallback(): void
    {
        $otp = SmsTypeRegistry::resolve('otp');
        $this->assertSame('auth_customer_otp', $otp['key']);

        $legacy = SmsTypeRegistry::resolve('transactional');
        $this->assertSame('transactional', $legacy['key']);
        $this->assertFalse($legacy['suppressible']);
    }
}
