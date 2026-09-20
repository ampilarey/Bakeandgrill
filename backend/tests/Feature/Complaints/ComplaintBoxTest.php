<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\ComplaintBoxEntry;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The complaint box. Owner, 2026-09-19: "some customers complain about
 * staffs ... an easy way for customers to complain ... anonymously or after
 * submitting his mobile number ... admin/owner should receive a sms
 * notification ... option to send sms to customer if there is mobile number
 * ... i want a separate complaints option not the one now used".
 */
class ComplaintBoxTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->owner = $this->makeOwner(['phone' => '+9607700100']);
        RateLimiter::clear('complaint-box-ip:127.0.0.1');
    }

    public function test_the_public_page_is_up_and_linked_from_the_footer_and_the_receipt(): void
    {
        $this->get('/complain')->assertOk()
            ->assertSee('Make a complaint')
            ->assertSee('Staff behaviour')
            ->assertSee('Stay anonymous')
            ->assertSee('/api/complaint-box');

        $this->get('/complain?order=BG-77&from=receipt')->assertOk()->assertSee('value="BG-77"', false);
        $this->get('/')->assertOk()->assertSee('href="/complain?from=footer"', false);
        $this->get('/complain/poster')->assertOk()->assertSee('data:image/svg+xml', false);
    }

    /**
     * Owner, 2026-09-21: the complaint box offered from the menu, the
     * printed menu, both apps' footers and the order status page, each
     * tagged so the Complaint Box says where it came from.
     */
    public function test_every_surface_that_offers_the_form_tags_where_it_came_from(): void
    {
        foreach (['menu', 'print', 'order', 'app', 'footer'] as $from) {
            $this->get('/complain?from=' . $from)->assertOk()
                ->assertSee('name="source" value="' . $from . '"', false);
        }
        // An unknown tag falls back to plain web rather than erroring.
        $this->get('/complain?from=nonsense')->assertOk()->assertSee('name="source" value="web"', false);

        $this->postJson('/api/complaint-box', [
            'categories' => ['food_quality'],
            'comment' => 'Cold',
            'anonymous' => true,
            'source' => 'print',
        ])->assertCreated();
        $this->assertDatabaseHas('complaint_box_entries', ['comment' => 'Cold', 'source' => 'print']);
    }

    /**
     * Owner, 2026-09-19: "also add the complaint QR on the receipt print".
     * The receipt page is what the till prints, so the code sits on it,
     * outside the block the print stylesheet hides, pointing at the live
     * site with the order number attached.
     */
    public function test_the_receipt_page_carries_the_complaint_qr_for_the_live_site(): void
    {
        $customer = $this->makeCustomer(['phone' => '+9607700200']);
        $order = $this->makePaidOrder($customer, ['order_number' => 'BG-CB-0007', 'total' => 40]);
        $receipt = \App\Models\Receipt::create(['order_id' => $order->id, 'token' => \Illuminate\Support\Str::random(48), 'channel' => 'sms', 'recipient' => $customer->phone]);

        $expectedUrl = 'https://bakeandgrill.mv/complain?from=receipt&order=BG-CB-0007';
        $res = $this->get('http://test.bakeandgrill.mv/receipts/' . $receipt->token)->assertOk();
        $res->assertSee('data-testid="receipt-complaint-qr"', false);
        // Blade escapes the & in the href.
        $res->assertSee('href="' . str_replace('&', '&amp;', $expectedUrl) . '"', false);
        $res->assertSee(\App\Support\ComplaintBoxLink::qr($expectedUrl, 200), false);

        // And the thermal slip gets the same address.
        $this->assertSame($expectedUrl, \App\Support\ComplaintBoxLink::url('receipt', 'BG-CB-0007'));
    }

    /**
     * Owner, 2026-09-19: "Qr code should be of live site, and add logo". The
     * poster points at the Business Website address whatever host it is
     * printed from, and carries the logo on top and in the middle of the code.
     */
    public function test_the_poster_points_at_the_live_site_and_carries_the_logo(): void
    {
        $res = $this->get('http://test.bakeandgrill.mv/complain/poster')->assertOk();

        $res->assertSee('bakeandgrill.mv/complain', false);
        $res->assertDontSee('test.bakeandgrill.mv', false);
        // "remove the logo from the top and make the logo inside the qr code bigger"
        $res->assertDontSee('class="logo"', false);
        // Owner, 2026-09-21: the logo is drawn inside the code's own SVG, so
        // there is no second picture laid over it any more.
        $res->assertDontSee('class="mark"', false);

        // The code on the page is byte-for-byte the code for the live address,
        // logo and all, at the size it has had on the wall since 2026-09-19.
        preg_match('#data:image/svg\+xml;base64,[A-Za-z0-9+/=]+#', $res->getContent(), $m);
        $this->assertSame(
            \App\Support\ComplaintBoxLink::qr('https://bakeandgrill.mv/complain?from=poster', 480, 0.33),
            $m[0],
        );
        $this->assertStringContainsString('<image ', base64_decode(substr($m[0], 26)));
    }

    public function test_an_anonymous_complaint_reaches_the_owner_by_sms_and_nobody_else(): void
    {
        $res = $this->postJson('/api/complaint-box', [
            'categories' => ['staff_behaviour', 'slow_service'],
            'about_staff' => 'The tall cashier',
            'comment' => 'He was rude when I asked for a bag.',
            'anonymous' => true,
        ])->assertCreated();

        $entry = ComplaintBoxEntry::query()->firstOrFail();
        $this->assertSame('CB-' . $entry->id, $res->json('reference_number'));
        $this->assertTrue($entry->is_anonymous);
        $this->assertNull($entry->phone);
        $this->assertSame('new', $entry->status);
        $this->assertSame('sent', $entry->owner_alert_status);

        $ownerSms = SmsLog::query()->where('type', 'owner_complaint_box_received')->where('reference_id', (string) $entry->id)->firstOrFail();
        $this->assertStringContainsString('CB-' . $entry->id, $ownerSms->message);
        $this->assertStringContainsString('Staff behaviour', $ownerSms->message);
        $this->assertStringContainsString('about The tall cashier', $ownerSms->message);
        $this->assertStringContainsString('Anonymous', $ownerSms->message);
        $this->assertSame('+9607700100', $ownerSms->to);

        $this->assertSame(0, SmsLog::query()->where('type', 'customer_complaint_box_acknowledged')->count());
    }

    public function test_a_complaint_with_a_number_is_acknowledged_by_sms(): void
    {
        $this->postJson('/api/complaint-box', [
            'categories' => ['food_quality'],
            'comment' => 'Cold fries.',
            'anonymous' => false,
            'phone' => '7 654 321',
        ])->assertCreated()->assertJsonPath('anonymous', false);

        $entry = ComplaintBoxEntry::query()->firstOrFail();
        $this->assertSame('+9607654321', $entry->phone);
        $this->assertFalse($entry->is_anonymous);

        $ack = SmsLog::query()->where('type', 'customer_complaint_box_acknowledged')->firstOrFail();
        $this->assertSame('+9607654321', $ack->to);
        $this->assertStringContainsString('CB-' . $entry->id, $ack->message);
        $this->assertStringContainsString('Customer left a number', SmsLog::query()->where('type', 'owner_complaint_box_received')->firstOrFail()->message);
    }

    public function test_the_form_refuses_a_bad_number_an_empty_category_and_a_filled_honeypot(): void
    {
        $this->postJson('/api/complaint-box', ['categories' => ['food_quality'], 'anonymous' => false, 'phone' => ''])
            ->assertStatus(422)->assertJsonValidationErrors(['phone']);
        $this->postJson('/api/complaint-box', ['categories' => ['food_quality'], 'anonymous' => false, 'phone' => '12345'])
            ->assertStatus(422)->assertJsonValidationErrors(['phone']);
        $this->postJson('/api/complaint-box', ['categories' => [], 'anonymous' => true])
            ->assertStatus(422)->assertJsonValidationErrors(['categories']);
        $this->postJson('/api/complaint-box', ['categories' => ['not_a_thing'], 'anonymous' => true])
            ->assertStatus(422);
        $this->postJson('/api/complaint-box', ['categories' => ['other'], 'anonymous' => true, 'website' => 'http://spam'])
            ->assertStatus(422);
        $this->assertSame(0, ComplaintBoxEntry::query()->count());
    }

    public function test_one_number_cannot_flood_the_box(): void
    {
        foreach ([1, 2, 3] as $i) {
            $this->postJson('/api/complaint-box', ['categories' => ['other'], 'anonymous' => false, 'phone' => '7654321', 'comment' => "n{$i}"])->assertCreated();
        }
        $this->postJson('/api/complaint-box', ['categories' => ['other'], 'anonymous' => false, 'phone' => '+9607654321'])
            ->assertStatus(429);
        $this->assertSame(3, ComplaintBoxEntry::query()->count());
    }

    public function test_taking_it_up_can_message_the_customer_and_closing_records_who(): void
    {
        $this->postJson('/api/complaint-box', ['categories' => ['staff_behaviour'], 'anonymous' => false, 'phone' => '7654321', 'comment' => 'Rude.'])->assertCreated();
        $entry = ComplaintBoxEntry::query()->firstOrFail();

        Sanctum::actingAs($this->owner, ['staff']);

        $this->patchJson("/api/complaint-box/{$entry->id}/status", [
            'status' => 'in_progress',
            'internal_note' => 'Spoke to Ahmed on shift.',
            'message' => 'We are looking into this now and will get back to you today.',
        ])->assertOk()->assertJsonPath('entry.status', 'in_progress');

        $entry->refresh();
        $this->assertNotNull($entry->taken_up_at);
        $this->assertSame('Spoke to Ahmed on shift.', $entry->internal_note);
        $this->assertSame('We are looking into this now and will get back to you today.', $entry->last_message);

        $update = SmsLog::query()->where('type', 'customer_complaint_box_update')->firstOrFail();
        $this->assertSame('+9607654321', $update->to);
        $this->assertStringContainsString('looking into this now', $update->message);
        $this->assertStringContainsString('CB-' . $entry->id, $update->message);

        // The internal note never leaves the building.
        $this->assertStringNotContainsString('Ahmed', $update->message);

        $this->postJson("/api/complaint-box/{$entry->id}/message", ['message' => 'Sorted — the staff member has been spoken to. Sorry again.'])
            ->assertCreated()->assertJsonPath('event.sms_status', 'demo');
        $this->assertSame(2, SmsLog::query()->where('type', 'customer_complaint_box_update')->count());

        $this->patchJson("/api/complaint-box/{$entry->id}/status", ['status' => 'resolved'])->assertOk();
        $entry->refresh();
        $this->assertSame('resolved', $entry->status);
        $this->assertSame($this->owner->id, $entry->resolved_by);
        $this->assertNotNull($entry->resolved_at);

        $types = $entry->events()->pluck('type')->all();
        $this->assertSame(['status', 'status', 'note', 'sms', 'sms', 'status'], $types);
    }

    public function test_an_anonymous_complaint_cannot_be_messaged(): void
    {
        $this->postJson('/api/complaint-box', ['categories' => ['cleanliness'], 'anonymous' => true])->assertCreated();
        $entry = ComplaintBoxEntry::query()->firstOrFail();

        Sanctum::actingAs($this->owner, ['staff']);
        $this->patchJson("/api/complaint-box/{$entry->id}/status", ['status' => 'in_progress', 'message' => 'Hello?'])
            ->assertStatus(422)->assertJsonValidationErrors(['message']);
        $this->assertSame('new', $entry->fresh()->status);

        $this->postJson("/api/complaint-box/{$entry->id}/message", ['message' => 'Hello?'])->assertStatus(422);
        $this->assertSame(0, SmsLog::query()->where('type', 'customer_complaint_box_update')->count());

        // Without a message the status still moves.
        $this->patchJson("/api/complaint-box/{$entry->id}/status", ['status' => 'in_progress'])->assertOk();
        $this->assertSame('in_progress', $entry->fresh()->status);
    }

    public function test_the_list_filters_and_counts_and_is_owner_only(): void
    {
        $this->postJson('/api/complaint-box', ['categories' => ['staff_behaviour'], 'anonymous' => true, 'comment' => 'rude'])->assertCreated();
        $this->postJson('/api/complaint-box', ['categories' => ['food_quality'], 'anonymous' => true, 'comment' => 'cold'])->assertCreated();

        Sanctum::actingAs($this->makeKitchenStaff(), ['staff']);
        $this->getJson('/api/complaint-box')->assertForbidden();

        Sanctum::actingAs($this->owner, ['staff']);
        $all = $this->getJson('/api/complaint-box')->assertOk();
        $this->assertSame(2, $all->json('meta.open_count'));
        $this->assertSame(2, $all->json('meta.new_count'));
        $this->assertSame(1, $all->json('meta.staff_open_count'));
        $this->assertCount(2, $all->json('entries.data'));
        $this->assertArrayNotHasKey('ip_hash', $all->json('entries.data.0'));

        $staff = $this->getJson('/api/complaint-box?category=staff')->assertOk();
        $this->assertCount(1, $staff->json('entries.data'));
        $this->assertSame(['staff_behaviour'], $staff->json('entries.data.0.categories'));

        $search = $this->getJson('/api/complaint-box?search=cold&status=all')->assertOk();
        $this->assertCount(1, $search->json('entries.data'));
    }
}
