<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Rules\MaldivesPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

/**
 * Tests for the MaldivesPhone validation rule and CustomerAuthController phone normalization.
 * Covers Security Audit Finding F — phone normalization too permissive.
 */
class PhoneNormalizationTest extends TestCase
{
    use RefreshDatabase;

    // ── Valid formats ─────────────────────────────────────────────────────────

    /** @dataProvider validPhoneProvider */
    public function test_valid_phone_formats_are_accepted(string $phone, string $expected): void
    {
        $validator = Validator::make(['phone' => $phone], ['phone' => [new MaldivesPhone()]]);

        $this->assertFalse($validator->fails(), "Expected '{$phone}' to be valid but it was rejected.");
        $this->assertSame($expected, MaldivesPhone::normalize($phone));
    }

    public static function validPhoneProvider(): array
    {
        return [
            'E.164 with plus'          => ['+9607654321', '+9607654321'],
            'E.164 with plus 9-prefix' => ['+9609654321', '+9609654321'],
            'E.164 with plus 3-prefix' => ['+9603654321', '+9603654321'],
            'E.164 with plus 6-prefix' => ['+9606654321', '+9606654321'],
            '10 digits no plus'        => ['9607654321',  '+9607654321'],
            '7 digits 7-prefix'        => ['7654321',     '+9607654321'],
            '7 digits 9-prefix'        => ['9654321',     '+9609654321'],
            '7 digits 3-prefix'        => ['3654321',     '+9603654321'],
            '7 digits 6-prefix'        => ['6543210',     '+9606543210'],
            'with spaces stripped'     => ['+960 765 4321', '+9607654321'],
            'with dashes stripped'     => ['+960-765-4321', '+9607654321'],
        ];
    }

    // ── Invalid formats ───────────────────────────────────────────────────────

    /** @dataProvider invalidPhoneProvider */
    public function test_invalid_phone_formats_are_rejected(string $phone): void
    {
        $validator = Validator::make(['phone' => $phone], ['phone' => [new MaldivesPhone()]]);

        $this->assertTrue($validator->fails(), "Expected '{$phone}' to be rejected but it was accepted.");
    }

    public static function invalidPhoneProvider(): array
    {
        return [
            'too many digits'        => ['99991234567'],
            'too short'              => ['123'],
            'non-numeric'            => ['abcdefg'],
            'US number'              => ['+14155551234'],
            'double zero prefix'     => ['00960XXXXXXX'],
            'wrong country code'     => ['+441234567'],
            '8 digits (too long)'    => ['12345678'],
            'starts with 1'          => ['1234567'],
            'starts with 2'          => ['2234567'],
            'starts with 4'          => ['4234567'],
            'starts with 5'          => ['5234567'],
            'starts with 8'          => ['8234567'],
            '00 prefix (not accepted)' => ['00960 765 4321'],
        ];
    }

    // ── Integration: OTP request rejects bad phone numbers ───────────────────

    public function test_otp_request_rejects_too_many_digits(): void
    {
        $response = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '99991234567',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_otp_request_rejects_non_maldivian_number(): void
    {
        $response = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '+14155551234',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_otp_request_accepts_valid_7_digit_number(): void
    {
        config(['app.debug' => true]);

        $response = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '7654321',
        ]);

        $response->assertOk();
    }

    public function test_otp_request_accepts_e164_format(): void
    {
        config(['app.debug' => true]);

        $response = $this->postJson('/api/auth/customer/otp/request', [
            'phone' => '+9607654321',
        ]);

        $response->assertOk();
    }

    public function test_otp_request_rejects_empty_phone(): void
    {
        $response = $this->postJson('/api/auth/customer/otp/request', ['phone' => '']);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);
    }

    public function test_normalize_throws_for_invalid_phone(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        MaldivesPhone::normalize('99991234567');
    }
}
