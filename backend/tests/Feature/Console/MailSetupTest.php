<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use App\Support\MailStatus;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Owner, 2026-10-06: "mail setup". The default "log" mailer drops every
 * e-mail without an error, so customers signing in by e-mail never get a
 * code. `mail:test` shows the settings and sends one; the deploy check warns.
 */
class MailSetupTest extends TestCase
{
    private function smtp(array $overrides = []): void
    {
        config(array_merge([
            'mail.default' => 'smtp',
            'mail.mailers.smtp.host' => 'mail.bakeandgrill.mv',
            'mail.mailers.smtp.port' => 465,
            'mail.mailers.smtp.scheme' => 'smtps',
            'mail.mailers.smtp.username' => 'no-reply@bakeandgrill.mv',
            'mail.mailers.smtp.password' => 'secret-password',
            'mail.mailers.smtp.url' => null,
            'mail.from.address' => 'no-reply@bakeandgrill.mv',
            'mail.from.name' => 'Bake & Grill',
        ], $overrides));
    }

    public function test_a_log_mailer_is_reported_as_not_sending(): void
    {
        config(['mail.default' => 'log', 'mail.from.address' => 'no-reply@bakeandgrill.mv']);
        $s = MailStatus::inspect();

        $this->assertFalse($s['sends']);
        $this->assertStringContainsString('not sent at all', $s['problems'][0]);
    }

    public function test_a_complete_smtp_setup_has_no_problems(): void
    {
        $this->smtp();
        $s = MailStatus::inspect();

        $this->assertTrue($s['sends']);
        $this->assertSame([], $s['problems']);
    }

    public function test_placeholder_host_missing_password_and_example_from_are_each_named(): void
    {
        $this->smtp([
            'mail.mailers.smtp.host' => '127.0.0.1',
            'mail.mailers.smtp.password' => null,
            'mail.from.address' => 'hello@example.com',
        ]);
        $problems = implode("\n", MailStatus::inspect()['problems']);

        $this->assertStringContainsString('MAIL_HOST', $problems);
        $this->assertStringContainsString('MAIL_PASSWORD', $problems);
        $this->assertStringContainsString('MAIL_FROM_ADDRESS', $problems);
    }

    public function test_mail_test_refuses_to_pretend_with_the_log_mailer(): void
    {
        config(['mail.default' => 'log', 'mail.from.address' => 'no-reply@bakeandgrill.mv']);

        $this->artisan('mail:test', ['to' => 'owner@example.org'])
            ->expectsOutputToContain('Nothing was sent')
            ->assertFailed();
    }

    public function test_mail_test_sends_one_e_mail_and_never_prints_the_password(): void
    {
        $this->smtp();
        Mail::fake();
        // Mail::fake() swaps the mailer, so send through it and check it went.
        $this->artisan('mail:test', ['to' => 'owner@example.org'])
            ->expectsOutputToContain('mail.bakeandgrill.mv:465')
            ->expectsOutputToContain('Sent to owner@example.org')
            ->doesntExpectOutputToContain('secret-password')
            ->assertSuccessful();
    }

    public function test_mail_test_reports_the_mail_server_error(): void
    {
        $this->smtp();
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('535 Incorrect authentication data'));

        $this->artisan('mail:test', ['to' => 'owner@example.org'])
            ->expectsOutputToContain('535 Incorrect authentication data')
            ->assertFailed();
    }

    public function test_mail_test_rejects_a_bad_address(): void
    {
        $this->artisan('mail:test', ['to' => 'not-an-address'])->assertFailed();
    }

    public function test_the_deploy_check_warns_but_does_not_block_when_mail_is_not_sending(): void
    {
        $this->app->detectEnvironment(static fn (): string => 'production');
        config([
            'app.debug' => false,
            'app.key' => 'base64:' . base64_encode(random_bytes(32)),
            'app.trusted_proxies' => '127.0.0.1',
            'sentry.dsn' => 'https://example@sentry.io/1',
            'backup.backup.destination.disks' => ['s3'],
            'queue.default' => 'redis',
            'cache.default' => 'redis',
            'system.healthcheck_url' => 'https://hc.example/ping',
            'sanctum.admin_token_ttl_hours_configured' => true,
            'mail.default' => 'log',
        ]);

        $this->artisan('app:verify-production-config')
            ->expectsOutputToContain('MAIL_*')
            ->assertSuccessful();
    }

    public function test_smtp_has_a_timeout_so_a_dead_mail_server_cannot_hold_a_checkout(): void
    {
        $this->assertSame(10, (int) config('mail.mailers.smtp.timeout'));
    }
}
