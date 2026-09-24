<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Support\SmsDeliveryRules;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Customer;
use App\Models\SmsCampaign;
use App\Models\SmsPromotion;
use App\Models\SmsPromotionRecipient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * SMS audit, 2026-09-24: one bulk system. Promotions no longer send;
 * campaigns carry one daily recipient cap that counts every campaign and
 * every old blast queued in the last 24 hours.
 */
class SmsBulkCapTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        for ($i = 1; $i <= 4; $i++) {
            Customer::create(['name' => "C{$i}", 'phone' => sprintf('+96077%05d', $i), 'loyalty_points' => 0, 'tier' => 'bronze', 'is_active' => true, 'sms_opt_out' => false]);
        }
    }

    public function test_promotion_sending_is_gone_and_points_at_campaigns(): void
    {
        $this->postJson('/api/sms/promotions/preview', ['message' => 'Hi'])->assertStatus(410)->assertJsonPath('moved_to', '/admin/sms/campaigns');
        $this->postJson('/api/sms/promotions/send', ['message' => 'Hi'])->assertStatus(410);
        $this->assertSame(0, SmsPromotion::count());
        $this->getJson('/api/sms/promotions')->assertOk();
    }

    public function test_one_cap_counts_campaigns_and_old_blasts_together(): void
    {
        $this->assertSame(5000, SmsDeliveryRules::all()['bulk_daily_recipient_cap'], 'default from config');
        $this->patchJson('/api/admin/sms/delivery-rules', ['bulk_daily_recipient_cap' => 5])->assertOk()->assertJsonPath('delivery_rules.bulk_daily_recipient_cap', 5);

        // Two blast recipients from the old system, queued an hour ago, count.
        $promo = SmsPromotion::create(['name' => 'Old blast', 'message' => 'x', 'status' => 'completed', 'recipient_count' => 2, 'filters' => []]);
        foreach (['+9607700001', '+9607700002'] as $phone) {
            SmsPromotionRecipient::create(['sms_promotion_id' => $promo->id, 'phone' => $phone, 'status' => 'sent']);
        }

        $preview = $this->postJson('/api/admin/sms/campaigns/preview', ['message' => 'Deal', 'target_criteria' => []])->assertOk();
        $preview->assertJsonPath('recipient_count', 4)
            ->assertJsonPath('daily_cap.cap', 5)
            ->assertJsonPath('daily_cap.used_24h', 2)
            ->assertJsonPath('daily_cap.remaining', 3)
            ->assertJsonPath('daily_cap.blocked', true);

        $campaign = SmsCampaign::create(['name' => 'Deal', 'message' => 'Deal', 'status' => 'draft', 'target_criteria' => []]);
        $this->postJson("/api/admin/sms/campaigns/{$campaign->id}/send")->assertStatus(429)
            ->assertJsonFragment(['message' => 'Daily bulk cap: 2 recipients were queued in the last 24 hours, this send adds 4, the cap is 5. Wait, narrow the audience, or raise the cap in the Control Center.']);
        $this->assertSame('draft', $campaign->fresh()->status, 'nothing queued');

        $this->patchJson('/api/admin/sms/delivery-rules', ['bulk_daily_recipient_cap' => 6])->assertOk();
        $this->postJson("/api/admin/sms/campaigns/{$campaign->id}/send")->assertOk()->assertJsonPath('campaign.total_recipients', 4);

        // Those four now count against the next campaign.
        $this->assertSame(6, SmsDeliveryRules::bulkRecipientsLast24h());
        $next = SmsCampaign::create(['name' => 'Again', 'message' => 'Again', 'status' => 'draft', 'target_criteria' => []]);
        $this->postJson("/api/admin/sms/campaigns/{$next->id}/send")->assertStatus(429);

        $this->patchJson('/api/admin/sms/delivery-rules', ['bulk_daily_recipient_cap' => 0])->assertOk();
        $this->assertNull(SmsDeliveryRules::bulkCapReason(100000), '0 = no cap');
    }

    public function test_an_empty_audience_is_a_reason_not_a_server_error(): void
    {
        $campaign = SmsCampaign::create(['name' => 'Nobody', 'message' => 'x', 'status' => 'draft', 'target_criteria' => ['tier' => ['platinum']]]);
        $this->postJson("/api/admin/sms/campaigns/{$campaign->id}/send")->assertStatus(422)
            ->assertJsonPath('message', 'No eligible recipients found for this campaign.');
    }
}
