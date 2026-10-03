<?php

declare(strict_types=1);

namespace Tests\Feature\Sms;

use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Controllers\Api\SmsControlCenterController;
use App\Models\SiteSetting;
use App\Models\SmsLog;
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
        $this->assertSame('Owners & managers', $types['owner_stock_reorder']['recipients']);
        $this->assertSame('"Stock alert SMS" in Settings', $types['owner_stock_reorder']['also_needs']);
        $this->assertSame('Business phone', $types['owner_device_approval']['recipients']);
        $this->assertNull($types['owner_device_approval']['also_needs']);
        $this->assertSame('Hours set in Settings → Notifications', $types['owner_shift_left_open']['also_needs']);
    }

    public function test_split_also_needs_leaves_plain_text_alone(): void
    {
        $this->assertSame(['The ordering customer', null], SmsControlCenterController::splitAlsoNeeds('The ordering customer'));
        // A bracket that explains the recipient, not a second switch, stays as it is.
        $this->assertSame(['Refund phone (order phone or walk-in add)', null], SmsControlCenterController::splitAlsoNeeds('Refund phone (order phone or walk-in add)'));
        $this->assertSame(['Business phone', 'The TV alert switch in Signage'], SmsControlCenterController::splitAlsoNeeds('Business phone (also needs the TV alert switch in Signage)'));
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
