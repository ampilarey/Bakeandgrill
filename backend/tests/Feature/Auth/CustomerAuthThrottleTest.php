<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Owner, 2026-10-06 (screenshot): "Too Many Attempts." on the phone step
 * while testing sign-in. The phone check was 30 a minute per IP, and many
 * customers on a Maldivian mobile network share one public IP. It is now
 * 10 a minute per IP and number (120 per IP), and the reply says how long
 * to wait.
 */
class CustomerAuthThrottleTest extends TestCase
{
    use RefreshDatabase;

    private function check(string $phone)
    {
        return $this->postJson('/api/auth/customer/check-phone', ['phone' => $phone]);
    }

    public function test_one_number_is_limited_but_others_on_the_same_network_are_not(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->check('7771234')->assertOk();
        }

        $this->check('7771234')
            ->assertStatus(429)
            ->assertJsonPath('errors.phone.0', fn (string $m) => str_starts_with($m, 'Too many tries. Please wait ')
                && str_ends_with($m, ' seconds and try again.'));

        // Someone else behind the same public IP still gets through.
        $this->check('9123456')->assertOk();
    }

    public function test_the_same_number_written_differently_shares_one_budget(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->check('7771234')->assertOk();
            $this->check('+960 777 1234')->assertOk();
        }
        $this->check('+9607771234')->assertStatus(429);
    }

    public function test_the_network_ceiling_still_stops_number_scanning(): void
    {
        for ($i = 0; $i < 120; $i++) {
            $this->check('77' . str_pad((string) $i, 5, '0', STR_PAD_LEFT))->assertOk();
        }
        $this->check('7799999')->assertStatus(429)->assertJsonStructure(['message', 'errors' => ['phone']]);
    }

    public function test_other_sign_in_routes_answer_in_words_too(): void
    {
        for ($i = 0; $i < 30; $i++) {
            $this->postJson('/api/auth/customer/forgot-password', ['phone' => '12']);
        }
        $this->postJson('/api/auth/customer/forgot-password', ['phone' => '12'])
            ->assertStatus(429)
            ->assertJsonPath('message', fn (string $m) => str_starts_with($m, 'Too many tries. Please wait '));
    }
}
