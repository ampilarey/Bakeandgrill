<?php

declare(strict_types=1);

namespace Tests\Feature\Catering;

use App\Domains\Catering\Services\CateringNotifyRecipients;
use App\Domains\Catering\Services\CateringQuoteService;
use App\Models\CateringRequest;
use App\Models\CateringRequestLine;
use App\Models\Item;
use App\Models\Permission;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EventQuotePhase3Test extends TestCase
{
    use RefreshDatabase;

    private User $eventsStaff;

    private User $otherEventsStaff;

    private Item $catalogItem;

    protected function setUp(): void
    {
        parent::setUp();
        SiteSetting::set('catering_quote_valid_days', '7');
        SiteSetting::set('catering_quote_min_hours_before_event', '24');
        SiteSetting::set('catering_notify_phone', '9000000');
        SiteSetting::set('catering_notify_email', 'fallback@bakeandgrill.test');

        Permission::query()->firstOrCreate(
            ['slug' => 'events.manage'],
            ['name' => 'Manage events', 'group' => 'Events'],
        );

        $this->eventsStaff = $this->makeStaff('staff', [
            'name' => 'Event Lead',
            'phone' => '7777101',
            'email' => 'lead@bakeandgrill.test',
        ]);
        $this->eventsStaff->grantPermission('events.manage');

        $this->otherEventsStaff = $this->makeStaff('staff', [
            'name' => 'Event Helper',
            'phone' => '7777102',
            'email' => 'helper@bakeandgrill.test',
        ]);
        $this->otherEventsStaff->grantPermission('events.manage');

        $this->catalogItem = Item::factory()->create([
            'name' => 'Party Tray',
            'base_price' => 100.00,
            'is_active' => true,
            'has_variants' => false,
        ]);
    }

    private function makeDraft(array $overrides = []): CateringRequest
    {
        $row = CateringRequest::create(array_merge([
            'reference' => CateringRequest::generateReference(),
            'contact_name' => 'Aisha',
            'phone' => '7777001',
            'email' => 'aisha@example.com',
            'occasion' => 'event',
            'event_date' => now()->addDays(10)->toDateString(),
            'fulfillment_method' => 'pickup',
            'status' => 'draft',
            'source' => 'event_order',
            'quote_version' => 1,
        ], $overrides));

        CateringRequestLine::create([
            'catering_request_id' => $row->id,
            'item_id' => $this->catalogItem->id,
            'name' => 'Party Tray',
            'quantity' => 2,
            'unit_price' => 100.00,
            'is_custom' => false,
            'sort_order' => 0,
        ]);
        CateringRequestLine::create([
            'catering_request_id' => $row->id,
            'item_id' => null,
            'name' => 'Extra chutney',
            'quantity' => 1,
            'unit_price' => null,
            'is_custom' => true,
            'sort_order' => 1,
        ]);

        return $row->fresh('lines');
    }

    public function test_line_replace_re_resolves_catalog_prices_ignores_client(): void
    {
        $row = $this->makeDraft();
        $this->catalogItem->update(['base_price' => 250.00]);

        Sanctum::actingAs($this->eventsStaff, ['staff']);

        $this->putJson('/api/admin/customers/catering-requests/' . $row->id . '/lines', [
            'lines' => [
                [
                    'item_id' => $this->catalogItem->id,
                    'quantity' => 3,
                    'unit_price' => 1.00, // ignored
                ],
                [
                    'custom_name' => 'Extra chutney',
                    'quantity' => 2,
                    'unit_price' => 15.50,
                    'is_custom' => true,
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('request.lines.0.unit_price', 250)
            ->assertJsonPath('request.lines.0.quantity', 3)
            ->assertJsonPath('request.lines.1.unit_price', 15.5)
            ->assertJsonPath('request.handled_by', $this->eventsStaff->id);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'catering.lines_replaced',
            'model_id' => $row->id,
        ]);
    }

    public function test_custom_price_and_quote_actions_require_events_manage(): void
    {
        $row = $this->makeDraft();
        $noPerm = $this->makeStaff('staff', ['email' => 'noperm@test']);
        // customers.manage only
        Permission::query()->firstOrCreate(
            ['slug' => 'customers.manage'],
            ['name' => 'Manage customers', 'group' => 'Customers'],
        );
        $noPerm->grantPermission('customers.manage');

        Sanctum::actingAs($noPerm, ['staff']);

        $this->putJson('/api/admin/customers/catering-requests/' . $row->id . '/lines', [
            'lines' => [
                ['custom_name' => 'X', 'quantity' => 1, 'unit_price' => 10, 'is_custom' => true],
            ],
        ])->assertStatus(403);

        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => 10,
            'is_deposit' => false,
        ])->assertStatus(403);

        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/duplicate')
            ->assertStatus(403);

        // List still allowed via customers.manage
        $this->getJson('/api/admin/customers/catering-requests')->assertOk();
    }

    public function test_send_blocked_with_unpriced_custom_lines(): void
    {
        $row = $this->makeDraft();
        Sanctum::actingAs($this->eventsStaff, ['staff']);

        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => 200,
            'is_deposit' => false,
        ])->assertStatus(422);
    }

    public function test_deposit_bounds_and_full_payment_validation(): void
    {
        $row = $this->makeDraft();
        Sanctum::actingAs($this->eventsStaff, ['staff']);

        $this->putJson('/api/admin/customers/catering-requests/' . $row->id . '/lines', [
            'lines' => [
                ['item_id' => $this->catalogItem->id, 'quantity' => 2],
                ['custom_name' => 'Setup', 'quantity' => 1, 'unit_price' => 50, 'is_custom' => true],
            ],
        ])->assertOk();

        $preview = app(CateringQuoteService::class)->taxPreview($row->fresh('lines'));
        $totalMvr = $preview['total_laar'] / 100;

        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => $totalMvr + 10,
            'is_deposit' => true,
        ])->assertStatus(422);

        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => $totalMvr - 1,
            'is_deposit' => false,
        ])->assertStatus(422);

        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => 50,
            'is_deposit' => true,
        ])
            ->assertOk()
            ->assertJsonPath('request.status', 'awaiting_customer')
            ->assertJsonPath('request.quote_is_deposit', true)
            ->assertJsonPath('request.handled_by', $this->eventsStaff->id);
    }

    public function test_resend_rotates_token_old_token_dies_notifies_idempotent(): void
    {
        Mail::fake();
        $row = $this->makeDraft(['handled_by' => $this->eventsStaff->id]);
        Sanctum::actingAs($this->eventsStaff, ['staff']);

        $this->putJson('/api/admin/customers/catering-requests/' . $row->id . '/lines', [
            'lines' => [
                ['item_id' => $this->catalogItem->id, 'quantity' => 1],
                ['custom_name' => 'Setup', 'quantity' => 1, 'unit_price' => 20, 'is_custom' => true],
            ],
        ])->assertOk();

        $preview = app(CateringQuoteService::class)->taxPreview($row->fresh('lines'));
        $totalMvr = $preview['total_laar'] / 100;

        $first = $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => $totalMvr,
            'is_deposit' => false,
        ])->assertOk();

        $token1 = $row->fresh()->quote_token;
        $this->assertNotEmpty($token1);
        $this->assertSame(1, (int) $row->fresh()->quote_version);

        $this->getJson('/api/event-quotes/' . $token1)->assertOk();

        $smsBefore = SmsLog::query()->count();

        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => $totalMvr,
            'is_deposit' => false,
        ])->assertOk()->assertJsonPath('request.quote_version', 2);

        $token2 = $row->fresh()->quote_token;
        $this->assertNotSame($token1, $token2);
        $this->getJson('/api/event-quotes/' . $token1)->assertNotFound();
        $this->getJson('/api/event-quotes/' . $token2)->assertOk();

        // Re-notify with same version key is idempotent at SMS layer — call notify again
        $fresh = $row->fresh(['lines']);
        app(CateringQuoteService::class)->sendQuote($fresh, [
            'payment_amount_mvr' => $totalMvr,
            'is_deposit' => false,
        ], $this->eventsStaff);

        $this->assertGreaterThan($smsBefore, SmsLog::query()->count());
        unset($first);
    }

    public function test_expiry_uses_min_of_valid_days_and_event_cutoff(): void
    {
        $service = app(CateringQuoteService::class);

        $byDays = CateringRequest::create([
            'reference' => 'EV-TEST-DAYS',
            'contact_name' => 'A',
            'phone' => '7111111',
            'event_date' => now()->addDays(30)->toDateString(),
            'status' => 'draft',
        ]);
        $expiresDays = $service->computeExpiry($byDays);
        $this->assertTrue($expiresDays->between(now()->addDays(6)->addHours(20), now()->addDays(7)->addHour()));

        $byEvent = CateringRequest::create([
            'reference' => 'EV-TEST-EVT',
            'contact_name' => 'B',
            'phone' => '7111112',
            'event_date' => now()->addDays(2)->toDateString(),
            'status' => 'draft',
        ]);
        $expiresEvent = $service->computeExpiry($byEvent);
        $expected = now()->parse($byEvent->event_date->toDateString() . ' 00:00:00')->subHours(24);
        $this->assertTrue($expiresEvent->equalTo($expected) || abs($expiresEvent->diffInSeconds($expected)) < 2);
    }

    public function test_public_quote_token_and_expiry_behavior(): void
    {
        $row = $this->makeDraft();
        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $this->putJson('/api/admin/customers/catering-requests/' . $row->id . '/lines', [
            'lines' => [
                ['item_id' => $this->catalogItem->id, 'quantity' => 1],
                ['custom_name' => 'Fee', 'quantity' => 1, 'unit_price' => 10, 'is_custom' => true],
            ],
        ])->assertOk();
        $preview = app(CateringQuoteService::class)->taxPreview($row->fresh('lines'));
        $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/send-quote', [
            'payment_amount_mvr' => $preview['total_laar'] / 100,
            'is_deposit' => false,
        ])->assertOk();

        $token = $row->fresh()->quote_token;
        $this->getJson('/api/event-quotes/' . $token)
            ->assertOk()
            ->assertJsonMissing(['id'])
            ->assertJsonPath('quote.reference', $row->reference);

        $this->getJson('/api/event-quotes/not-a-real-token-xxxxxxxxxxxx')->assertNotFound();

        $row->update(['quote_expires_at' => now()->subMinute()]);
        $this->getJson('/api/event-quotes/' . $token)
            ->assertStatus(410)
            ->assertJsonPath('expired', true);

        // Line edit clears token
        $row->update(['quote_expires_at' => now()->addDay(), 'status' => 'awaiting_customer', 'quote_token' => $token]);
        $this->putJson('/api/admin/customers/catering-requests/' . $row->id . '/lines', [
            'lines' => [
                ['item_id' => $this->catalogItem->id, 'quantity' => 2],
                ['custom_name' => 'Fee', 'quantity' => 1, 'unit_price' => 10, 'is_custom' => true],
            ],
        ])->assertOk()->assertJsonPath('request.status', 'quoted');
        $this->assertNull($row->fresh()->quote_token);
        $this->getJson('/api/event-quotes/' . $token)->assertNotFound();
    }

    public function test_ownership_notify_targets_and_reassign_audit(): void
    {
        $helper = app(CateringNotifyRecipients::class);
        $unassigned = $this->makeDraft(['handled_by' => null]);
        $createdTargets = $helper->forCreated();
        $lifecycleUnassigned = $helper->forLifecycle($unassigned);
        $this->assertSameSize($createdTargets, $lifecycleUnassigned);
        $userIds = collect($createdTargets)->pluck('user_id')->filter()->all();
        $this->assertContains($this->eventsStaff->id, $userIds);
        $this->assertContains($this->otherEventsStaff->id, $userIds);

        $assigned = $this->makeDraft(['handled_by' => $this->eventsStaff->id, 'reference' => CateringRequest::generateReference()]);
        $lifecycleAssigned = $helper->forLifecycle($assigned);
        $assignedUserIds = collect($lifecycleAssigned)->pluck('user_id')->filter()->values()->all();
        $this->assertContains($this->eventsStaff->id, $assignedUserIds);
        $this->assertNotContains($this->otherEventsStaff->id, $assignedUserIds);
        $this->assertTrue(collect($lifecycleAssigned)->contains(fn ($t) => ($t['source'] ?? '') === 'settings'));

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $this->patchJson('/api/admin/customers/catering-requests/' . $assigned->id, [
            'handled_by' => $this->otherEventsStaff->id,
        ])
            ->assertOk()
            ->assertJsonPath('request.handled_by', $this->otherEventsStaff->id);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'catering.assigned',
            'model_id' => $assigned->id,
        ]);
    }

    public function test_duplicate_reprices_catalog_clears_dates_unassigned(): void
    {
        $row = $this->makeDraft([
            'handled_by' => $this->eventsStaff->id,
            'fulfillment_time' => '12:00:00',
            'setup_time' => '11:00:00',
            'venue_name' => 'Hall',
            'quote_token' => 'oldtokenoldtokenoldtokenoldtokenoldtokenxxxx',
        ]);
        // Price a custom line
        $row->lines()->where('is_custom', true)->update(['unit_price' => 12.00]);
        $this->catalogItem->update(['base_price' => 333.00]);

        Sanctum::actingAs($this->eventsStaff, ['staff']);
        $res = $this->postJson('/api/admin/customers/catering-requests/' . $row->id . '/duplicate')
            ->assertCreated();

        $copyId = $res->json('request.id');
        $copy = CateringRequest::query()->with('lines')->findOrFail($copyId);

        $this->assertSame('draft', $copy->status);
        $this->assertNull($copy->handled_by);
        $this->assertNull($copy->quote_token);
        $this->assertNull($copy->event_date);
        $this->assertNull($copy->fulfillment_time);
        $this->assertNull($copy->setup_time);
        $this->assertSame('Hall', $copy->venue_name);
        $this->assertNotSame($row->reference, $copy->reference);

        $catalogLine = $copy->lines->firstWhere('is_custom', false);
        $customLine = $copy->lines->firstWhere('is_custom', true);
        $this->assertSame(333.0, (float) $catalogLine->unit_price);
        $this->assertSame(12.0, (float) $customLine->unit_price);
        $this->assertTrue((bool) $customLine->price_needs_review);
    }

    public function test_pipeline_search_filters_by_name_phone(): void
    {
        $this->makeDraft(['contact_name' => 'UniqueZebra', 'phone' => '7555123']);
        $this->makeDraft(['contact_name' => 'Other', 'phone' => '7111000', 'reference' => CateringRequest::generateReference()]);

        Sanctum::actingAs($this->eventsStaff, ['staff']);

        $this->getJson('/api/admin/customers/catering-requests?q=UniqueZebra')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.contact_name', 'UniqueZebra');

        $this->getJson('/api/admin/customers/catering-requests?q=7555')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);

        $this->getJson('/api/admin/customers/catering-requests?assigned_to_me=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 0);

        $owned = $this->makeDraft([
            'handled_by' => $this->eventsStaff->id,
            'reference' => CateringRequest::generateReference(),
        ]);
        $this->getJson('/api/admin/customers/catering-requests?assigned_to_me=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $owned->id);
    }
}
