<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Telegram\Services\TelegramAlertCopier;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\SmsTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * SMS settings audit, 2026-10-03: the owner has a switch for every type, can
 * see where owner alerts land, sees a type's second dependency as its own
 * line, and can send any type's wording to their own phone as a test.
 */
class SmsControlCenterAuditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
    }

    public function test_every_type_but_the_always_on_ones_has_a_switch(): void
    {
        $missing = [];
        foreach (SmsTypeRegistry::definitions() as $def) {
            if (empty($def['always_on']) && empty($def['enabled_setting'])) {
                $missing[] = $def['key'];
            }
        }
        $this->assertSame([], $missing, 'these types cannot be switched off by the owner');
    }

    public function test_the_wholesale_texts_now_switch_off(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->patchJson('/api/admin/sms/types/trade_dispatch_shop', ['enabled' => false])->assertOk()->assertJsonPath('enabled', false);
        $this->patchJson('/api/admin/sms/types/trade_reconcile_mismatch_owner', ['enabled' => false])->assertOk()->assertJsonPath('enabled', false);
        $this->assertFalse(SmsTypeRegistry::isTypeEnabled(SmsTypeRegistry::get('trade_dispatch_shop')));
        $this->assertFalse(SmsTypeRegistry::isTypeEnabled(SmsTypeRegistry::get('trade_reconcile_mismatch_owner')));
    }

    public function test_the_overview_shows_the_business_and_owner_phones_and_splits_second_dependencies(): void
    {
        SiteSetting::set('business_phone', '+9607771234');
        SiteSetting::bust();
        $owner = $this->makeOwner(['name' => 'Ahmed', 'phone' => '+9607770001']);
        Sanctum::actingAs($owner, ['staff']);

        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $this->assertSame('+9607771234', $res->json('business_phone'));
        $this->assertSame('+9607770001', $res->json('my_phone'));
        $this->assertSame([['name' => 'Ahmed', 'phone' => '+9607770001']], $res->json('owner_phones'));

        $types = collect($res->json('types'))->keyBy('key');
        $this->assertFalse($types->has(SmsTypeRegistry::SETTINGS_TEST_TYPE), 'the test carrier is not a row');
        $this->assertFalse($types->has('staff_campaign_test'), 'nor is the campaign test carrier');
        $this->assertSame('Owners & managers', $types['owner_stock_reorder']['recipients']);
        $this->assertSame('Business phone', $types['owner_device_approval']['recipients']);
        // One switch per channel on the row, and nothing else (2026-10-10).
        $this->assertArrayNotHasKey('also_needs', $types['owner_stock_reorder']);
    }

    /**
     * Admin → Notifications warns that the rows' Telegram switches send
     * nothing while Telegram alerts are off or no bot is set up (2026-10-10).
     */
    public function test_the_list_says_whether_telegram_alerts_can_go_at_all(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $res = $this->getJson('/api/admin/sms/control-center')->assertOk();
        $this->assertTrue($res->json('telegram_alerts_on'));
        $this->assertFalse($res->json('telegram_bot_ready'));

        SiteSetting::set(TelegramAlertCopier::SETTING_ENABLED, 'false');
        $this->assertFalse($this->getJson('/api/admin/sms/control-center')->json('telegram_alerts_on'));
    }

    /** SMS campaigns → Templates leaves a message's wording to its row in Notifications. */
    public function test_each_template_names_the_messages_it_words(): void
    {
        SmsTemplate::query()->updateOrCreate(['slug' => 'order_new'], ['name' => 'New order', 'type' => 'order_notification', 'is_system' => true, 'body' => 'New order {{order_number}}']);
        SmsTemplate::query()->updateOrCreate(['slug' => 'weekend-promo-ab12'], ['name' => 'Weekend promo', 'type' => 'custom', 'is_system' => false, 'body' => 'Weekend!']);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $templates = collect($this->getJson('/api/admin/sms/templates')->assertOk()->json('templates'))->keyBy('slug');
        $this->assertSame([['key' => 'staff_new_order', 'label' => 'Staff: new order']], $templates['order_new']['used_by']);
        $this->assertSame([], $templates['weekend-promo-ab12']['used_by']);
    }

    /** A message with several wordings edits them all on its row (2026-10-10). */
    public function test_a_row_carries_and_saves_its_other_wordings(): void
    {
        SmsTemplate::query()->updateOrCreate(['slug' => 'customer_order_ready_delivery'], ['name' => 'Ready (delivery)', 'type' => 'customer_notification', 'is_system' => true, 'body' => '#{{order_number}} is packed.']);
        SmsTemplate::query()->updateOrCreate(['slug' => 'credit_reminder_overdue'], ['name' => 'Overdue', 'type' => 'customer_notification', 'is_system' => true, 'body' => 'Invoice {{invoice_number}} is overdue.']);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $types = collect($this->getJson('/api/admin/sms/control-center')->assertOk()->json('types'))->keyBy('key');
        $extra = collect($types['customer_order_ready']['extra_templates'])->keyBy('slug');
        $this->assertSame('#{{order_number}} is packed.', $extra['customer_order_ready_delivery']['body']);
        $this->assertSame('Delivery orders (packed for the rider)', $extra['customer_order_ready_delivery']['label']);
        $this->assertSame([], $types['giftcard_delivery']['extra_templates']);

        $this->patchJson('/api/admin/sms/types/customer_order_ready', ['extra_templates' => ['customer_order_ready_delivery' => 'Packed: #{{order_number}}']])
            ->assertOk()
            ->assertJsonPath('extra_templates.0.body', 'Packed: #{{order_number}}');
        $this->assertSame('Packed: #{{order_number}}', SmsTemplate::where('slug', 'customer_order_ready_delivery')->value('body'));

        // Only the message's own wordings.
        $this->patchJson('/api/admin/sms/types/customer_order_ready', ['extra_templates' => ['credit_reminder_overdue' => 'x']])->assertStatus(422);
        $this->assertSame('Invoice {{invoice_number}} is overdue.', SmsTemplate::where('slug', 'credit_reminder_overdue')->value('body'));

        $templates = collect($this->getJson('/api/admin/sms/templates')->json('templates'))->keyBy('slug');
        $this->assertSame('credit_payment_reminder', $templates['credit_reminder_overdue']['used_by'][0]['key']);
    }

    /**
     * Notifications audit, 2026-10-10: no alert may depend on a switch
     * somewhere else. A recipients note naming one ("also needs the … switch
     * in …", "set in Settings") is how they crept in before.
     */
    public function test_no_message_names_a_second_switch_elsewhere(): void
    {
        foreach (SmsTypeRegistry::all() as $entry) {
            $this->assertDoesNotMatchRegularExpression('/also needs|also the|switch in|set in|set on/i', (string) $entry['recipients'], $entry['key']);
        }
    }

    public function test_send_me_a_test_sends_the_wording_to_my_phone_and_is_logged(): void
    {
        $owner = $this->makeOwner(['phone' => '+9607770001']);
        Sanctum::actingAs($owner, ['staff']);

        $sent = [];
        $sms = $this->createMock(SmsService::class);
        $sms->expects($this->exactly(2))->method('send')->willReturnCallback(function ($msg) use (&$sent) {
            $sent[] = $msg;

            return new SmsLog(['message' => $msg->message, 'to' => $msg->to, 'type' => $msg->type, 'status' => 'sent']);
        });
        $this->app->instance(SmsService::class, $sms);

        $res = $this->postJson('/api/admin/sms/types/owner_device_approval/test')->assertOk();
        $this->assertTrue($res->json('ok'));
        $this->assertSame('+9607770001', $sent[0]->to);
        $this->assertSame(SmsTypeRegistry::SETTINGS_TEST_TYPE, $sent[0]->type);
        $this->assertStringStartsWith('[TEST]', $sent[0]->message);
        $this->assertStringContainsString('POS device waiting for approval', $sent[0]->message);

        // A typed number and a draft wording win over the saved ones.
        $this->postJson('/api/admin/sms/types/giftcard_delivery/test', ['phone' => '+9607779999', 'body' => 'Hello {{amount}}'])->assertOk();
        $this->assertSame('+9607779999', $sent[1]->to);
        $this->assertStringContainsString('Hello', $sent[1]->message);
        $this->assertStringNotContainsString('{{amount}}', $sent[1]->message);

        $this->postJson('/api/admin/sms/types/nope/test')->assertNotFound();
        $this->postJson('/api/admin/sms/types/' . SmsTypeRegistry::SETTINGS_TEST_TYPE . '/test')->assertNotFound();
    }

    public function test_send_me_a_test_needs_a_phone_and_the_settings_permission(): void
    {
        Sanctum::actingAs($this->makeOwner(['phone' => null]), ['staff']);
        $this->postJson('/api/admin/sms/types/owner_device_approval/test')->assertStatus(422);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->makeStaff('staff', ['phone' => '+9607770002']), ['staff']);
        $this->postJson('/api/admin/sms/types/owner_device_approval/test')->assertForbidden();
    }
}
