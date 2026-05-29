<?php

declare(strict_types=1);

namespace Tests\Feature\Marketing;

use App\Domains\Notifications\Services\BulkSmsService;
use App\Models\Customer;
use App\Models\Role;
use App\Models\SmsCampaign;
use App\Models\SmsCampaignRecipient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class Wave13SmsAbTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        $this->staff = User::create([
            'name' => 'Admin',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
    }

    public function test_ab_preview_splits_audience_and_cost(): void
    {
        for ($i = 1; $i <= 4; $i++) {
            Customer::create(['name' => "Gold {$i}", 'phone' => "+960700000{$i}", 'tier' => 'gold']);
        }

        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->postJson('/api/admin/sms/campaigns/preview', [
            'message' => 'Variant A: 20% off today!',
            'message_variant_b' => 'Variant B: Free drink with order!',
            'ab_test_enabled' => true,
            'ab_split_percent' => 50,
            'target_criteria' => ['tier' => ['gold']],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('recipient_count', 4)
            ->assertJsonPath('ab_test_enabled', true)
            ->assertJsonStructure(['ab_split' => ['variant_a', 'variant_b'], 'total_cost_mvr']);
    }

    public function test_ab_campaign_store_requires_variant_b_when_enabled(): void
    {
        Sanctum::actingAs($this->staff, ['staff']);

        $this->postJson('/api/admin/sms/campaigns', [
            'name' => 'Split Test',
            'message' => 'Hello A',
            'ab_test_enabled' => true,
        ])->assertStatus(422);
    }

    public function test_ab_campaign_dispatch_assigns_variants(): void
    {
        for ($i = 1; $i <= 10; $i++) {
            Customer::create(['name' => "Cust {$i}", 'phone' => "+960711100{$i}", 'tier' => 'silver']);
        }

        $campaign = SmsCampaign::create([
            'name' => 'A/B Weekend',
            'message' => 'Try our new burger!',
            'message_variant_b' => 'Try our new wrap!',
            'ab_test_enabled' => true,
            'ab_split_percent' => 50,
            'target_criteria' => ['tier' => ['silver']],
            'status' => 'draft',
            'created_by' => $this->staff->id,
        ]);

        app(BulkSmsService::class)->dispatch($campaign->fresh());

        $campaign->refresh();
        $this->assertEquals(10, $campaign->total_recipients);

        $variants = SmsCampaignRecipient::where('campaign_id', $campaign->id)
            ->pluck('variant')
            ->countBy()
            ->all();

        $this->assertArrayHasKey('a', $variants);
        $this->assertArrayHasKey('b', $variants);
        $this->assertEquals(10, ($variants['a'] ?? 0) + ($variants['b'] ?? 0));
    }

    public function test_message_for_variant_returns_correct_body(): void
    {
        $campaign = SmsCampaign::create([
            'name' => 'Copy test',
            'message' => 'Message A',
            'message_variant_b' => 'Message B',
            'ab_test_enabled' => true,
            'ab_split_percent' => 50,
            'status' => 'draft',
        ]);

        $this->assertSame('Message A', $campaign->messageForVariant('a'));
        $this->assertSame('Message B', $campaign->messageForVariant('b'));

        $campaign->update(['ab_test_enabled' => false]);
        $this->assertSame('Message A', $campaign->fresh()->messageForVariant('b'));
    }

    public function test_campaign_index_includes_ab_stats_when_enabled(): void
    {
        $campaign = SmsCampaign::create([
            'name' => 'Stats test',
            'message' => 'A',
            'message_variant_b' => 'B',
            'ab_test_enabled' => true,
            'ab_split_percent' => 50,
            'status' => 'draft',
            'total_recipients' => 2,
        ]);

        SmsCampaignRecipient::create([
            'campaign_id' => $campaign->id,
            'phone' => '+9607000001',
            'variant' => 'a',
            'status' => 'sent',
        ]);
        SmsCampaignRecipient::create([
            'campaign_id' => $campaign->id,
            'phone' => '+9607000002',
            'variant' => 'b',
            'status' => 'failed',
            'failure_reason' => 'test',
        ]);

        Sanctum::actingAs($this->staff, ['staff']);

        $response = $this->getJson('/api/admin/sms/campaigns');
        $response->assertStatus(200);

        $row = collect($response->json('data'))->firstWhere('id', $campaign->id);
        $this->assertNotNull($row);
        $this->assertTrue($row['ab_test_enabled']);
        $this->assertSame(1, $row['ab_stats']['a']['sent']);
        $this->assertSame(1, $row['ab_stats']['b']['failed']);
    }
}
