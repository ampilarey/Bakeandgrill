<?php

declare(strict_types=1);

namespace Tests\Feature\Newsletter;

use App\Domains\Newsletter\Bounces;
use App\Domains\Newsletter\Newsletter;
use App\Models\NewsletterSubscriber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Newsletter addresses that bounce stop getting it (App\Domains\Newsletter\Bounces). */
class NewsletterBouncesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function subscriber(string $email): NewsletterSubscriber
    {
        return NewsletterSubscriber::query()->create(['email' => $email, 'locale' => 'en', 'token' => Str::random(48), 'confirmed_at' => now(), 'source' => 'website']);
    }

    private function dsn(string $email, string $action, string $status, string $diag = 'smtp; 550 5.1.1 User unknown'): string
    {
        return "From: Mail Delivery System <MAILER-DAEMON@sg-s2.serverpanel.com>\r\nSubject: Mail delivery failed\r\n"
            . "Content-Type: multipart/report; report-type=delivery-status; boundary=\"b\"\r\n\r\n--b\r\nContent-Type: message/delivery-status\r\n\r\n"
            . "Reporting-MTA: dns; sg-s2.serverpanel.com\r\n\r\nFinal-Recipient: rfc822; {$email}\r\nAction: {$action}\r\nStatus: {$status}\r\nDiagnostic-Code: {$diag}\r\n\r\n--b--\r\n";
    }

    public function test_a_hard_bounce_stops_the_address_and_it_leaves_the_audience(): void
    {
        $this->subscriber('gone@example.test');
        $this->subscriber('fine@example.test');

        $this->assertSame(1, Bounces::handle($this->dsn('Gone@example.test', 'failed', '5.1.1')));

        $gone = NewsletterSubscriber::query()->where('email', 'gone@example.test')->first();
        $this->assertNotNull($gone->bounced_at);
        $this->assertStringContainsString('5.1.1', (string) $gone->bounce_reason);
        $this->assertSame(['fine@example.test'], app(Newsletter::class)->audience()->pluck('email')->all());
    }

    public function test_soft_bounces_stop_it_only_after_three_and_delays_do_not_count(): void
    {
        $this->subscriber('full@example.test');
        Bounces::handle($this->dsn('full@example.test', 'delayed', '4.4.1'));
        Bounces::handle($this->dsn('full@example.test', 'failed', '5.2.2', 'smtp; 552 5.2.2 Mailbox full'));
        Bounces::handle($this->dsn('full@example.test', 'failed', '4.2.2'));
        $sub = NewsletterSubscriber::query()->where('email', 'full@example.test')->first();
        $this->assertSame(2, $sub->bounce_count);
        $this->assertNull($sub->bounced_at);

        Bounces::handle($this->dsn('full@example.test', 'failed', '5.2.2'));
        $this->assertNotNull($sub->fresh()->bounced_at);
    }

    public function test_a_spam_complaint_unsubscribes_and_strangers_are_never_marked(): void
    {
        $this->subscriber('angry@example.test');
        $arf = "Content-Type: multipart/report; report-type=feedback-report\r\n\r\nFeedback-Type: abuse\r\nUser-Agent: Yahoo\r\nOriginal-Rcpt-To: angry@example.test\r\n";
        $this->assertSame(1, Bounces::handle($arf));
        $this->assertNotNull(NewsletterSubscriber::query()->where('email', 'angry@example.test')->value('unsubscribed_at'));

        $this->assertSame(0, Bounces::handle($this->dsn('stranger@example.test', 'failed', '5.1.1')));
        $this->assertSame(0, NewsletterSubscriber::query()->where('email', 'stranger@example.test')->count());
        $this->assertSame(0, Bounces::handle("Subject: hello\r\n\r\nJust a reply to no-reply."));
    }

    public function test_the_piped_command_always_succeeds_and_reads_a_file(): void
    {
        $this->subscriber('gone@example.test');
        $file = tempnam(sys_get_temp_dir(), 'dsn');
        file_put_contents($file, $this->dsn('gone@example.test', 'failed', '5.1.1'));
        $this->artisan('newsletter:bounce', ['--file' => $file])->assertSuccessful();
        $this->assertNotNull(NewsletterSubscriber::query()->where('email', 'gone@example.test')->value('bounced_at'));
        $this->artisan('newsletter:bounce', ['--file' => '/no/such/file'])->assertSuccessful();
        @unlink($file);
    }

    public function test_a_refusal_while_sending_is_a_bounce_but_trouble_with_the_server_is_not(): void
    {
        $this->subscriber('gone@example.test');
        $this->assertNull(Bounces::fromSendError('gone@example.test', new \RuntimeException('Connection could not be established with host "sg-s2": timed out')));
        $this->assertNull(Bounces::fromSendError('gone@example.test', new \RuntimeException('Expected response code "235" but got code "535", with message "535 5.7.8 Authentication failed".')));
        $this->assertNull(NewsletterSubscriber::query()->where('email', 'gone@example.test')->value('bounced_at'));

        $kind = Bounces::fromSendError('gone@example.test', new \RuntimeException('Expected response code "250/251/252" but got code "550", with message "550 5.1.1 <gone@example.test>: Recipient address rejected".'));
        $this->assertSame('hard', $kind);
        $this->assertNotNull(NewsletterSubscriber::query()->where('email', 'gone@example.test')->value('bounced_at'));
    }

    public function test_signing_up_again_and_confirming_clears_a_bounce(): void
    {
        $sub = $this->subscriber('back@example.test');
        Bounces::record('back@example.test', 'hard', '5.1.1');
        app(Newsletter::class)->subscribe('back@example.test', 'en', 'website');
        $this->assertNull($sub->fresh()->confirmed_at);
        app(Newsletter::class)->confirm($sub->fresh()->token);
        $fresh = $sub->fresh();
        $this->assertNull($fresh->bounced_at);
        $this->assertSame(0, $fresh->bounce_count);
    }
}
