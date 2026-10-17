<?php

declare(strict_types=1);

namespace Tests\Feature\Newsletter;

use App\Domains\Customers\Support\MessageChoices;
use App\Domains\Newsletter\Newsletter;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Jobs\SendNewsletterBatch;
use App\Mail\NewsletterConfirmMail;
use App\Mail\NewsletterIssueMail;
use App\Models\Customer;
use App\Models\NewsletterDelivery;
use App\Models\NewsletterIssue;
use App\Models\NewsletterSubscriber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** The email newsletter (iruali import plan, feature 4). */
class NewsletterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    public function test_sign_up_is_double_opt_in(): void
    {
        $this->post('/newsletter/subscribe', ['email' => 'Aisha@Example.com'])->assertRedirect();
        $sub = NewsletterSubscriber::query()->firstOrFail();
        $this->assertSame('aisha@example.com', $sub->email);
        $this->assertNull($sub->confirmed_at);
        Mail::assertSent(NewsletterConfirmMail::class, 1);
        $this->assertCount(0, app(Newsletter::class)->audience(), 'nothing until confirmed');

        $this->get('/newsletter/confirm/' . $sub->token)->assertOk()->assertSee("You're on the list", false);
        $this->assertCount(1, app(Newsletter::class)->audience());

        $this->post('/newsletter/subscribe', ['email' => 'bot@example.com', 'website' => 'spam'])->assertSessionHasErrors('website');
    }

    public function test_the_audience_joins_customers_who_allow_offers_by_email_once_each(): void
    {
        NewsletterSubscriber::create(['email' => 'shared@example.com', 'token' => str_repeat('a', 48), 'confirmed_at' => now()]);
        $yes = Customer::create(['name' => 'Yes', 'phone' => '+9607771001', 'email' => 'yes@example.com', 'email_verified_at' => now(), 'is_active' => true]);
        MessageChoices::update($yes, ['offers' => ['email' => true]]);
        $shared = Customer::create(['name' => 'Shared', 'phone' => '+9607771002', 'email' => 'Shared@example.com', 'email_verified_at' => now(), 'is_active' => true]);
        MessageChoices::update($shared, ['offers' => ['email' => true]]);
        Customer::create(['name' => 'No', 'phone' => '+9607771003', 'email' => 'no@example.com', 'email_verified_at' => now(), 'is_active' => true]);
        $out = Customer::create(['name' => 'Out', 'phone' => '+9607771004', 'email' => 'out@example.com', 'email_verified_at' => now(), 'is_active' => true]);
        MessageChoices::update($out, ['offers' => ['email' => true]]);
        NewsletterSubscriber::create(['email' => 'out@example.com', 'token' => str_repeat('b', 48), 'confirmed_at' => now(), 'unsubscribed_at' => now()]);

        $emails = app(Newsletter::class)->audience()->pluck('email')->sort()->values()->all();
        $this->assertSame(['shared@example.com', 'yes@example.com'], $emails);
    }

    public function test_sending_freezes_the_issue_and_a_retried_batch_never_sends_twice(): void
    {
        Queue::fake();
        foreach (['a', 'b', 'c'] as $n) {
            NewsletterSubscriber::create(['email' => "{$n}@example.com", 'token' => str_repeat($n, 48), 'confirmed_at' => now()]);
        }
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $id = $this->postJson('/api/admin/newsletter/issues', ['subject_en' => 'October news', 'subject_dv' => 'އޮކްޓޯބަރ', 'body_en' => 'New dishes.', 'sections' => ['new' => true]])
            ->assertCreated()->json('issue.id');
        $this->get("/api/admin/newsletter/issues/{$id}/preview?locale=dv")->assertOk()->assertSee('dir="rtl"', false);
        $this->postJson("/api/admin/newsletter/issues/{$id}/test", ['email' => 'owner@example.com'])->assertOk();
        Mail::assertSent(NewsletterIssueMail::class, fn ($m) => $m->test === true);

        $this->postJson("/api/admin/newsletter/issues/{$id}/send")->assertOk()->assertJsonPath('queued', 3);
        $this->postJson("/api/admin/newsletter/issues/{$id}/send")->assertUnprocessable();
        $this->assertIsArray(NewsletterIssue::query()->findOrFail($id)->frozen);
        Queue::assertPushed(SendNewsletterBatch::class, 1);

        $ids = NewsletterDelivery::query()->pluck('id')->all();
        (new SendNewsletterBatch($id, $ids))->handle(app(Newsletter::class));
        (new SendNewsletterBatch($id, $ids))->handle(app(Newsletter::class));
        Mail::assertSent(NewsletterIssueMail::class, fn ($m) => $m->test === false && $m->hasTo('a@example.com'));
        $this->assertSame(3, Mail::sent(NewsletterIssueMail::class, fn ($m) => $m->test === false)->count());
        $this->assertSame('sent', NewsletterIssue::query()->findOrFail($id)->status);
    }

    public function test_unsubscribe_needs_a_tap_and_turns_off_offers_email(): void
    {
        $customer = Customer::create(['name' => 'Z', 'phone' => '+9607771005', 'email' => 'z@example.com', 'email_verified_at' => now(), 'is_active' => true]);
        MessageChoices::update($customer, ['offers' => ['email' => true]]);
        $sub = NewsletterSubscriber::create(['email' => 'z@example.com', 'token' => str_repeat('z', 48), 'confirmed_at' => now(), 'customer_id' => $customer->id]);

        $this->get('/newsletter/unsubscribe/' . $sub->token)->assertOk()->assertSee('Stop the newsletter');
        $this->assertNull($sub->fresh()->unsubscribed_at, 'opening the link changes nothing');
        $this->post('/newsletter/unsubscribe/' . $sub->token, ['List-Unsubscribe' => 'One-Click'])->assertNoContent();
        $this->assertNotNull($sub->fresh()->unsubscribed_at);
        $this->assertFalse(MessageChoices::allows($customer->fresh(), MessageChoices::OFFERS, MessageChoices::EMAIL));
    }
}
