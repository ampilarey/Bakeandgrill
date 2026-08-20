<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Totp;
use PHPUnit\Framework\TestCase;

/**
 * The point of writing TOTP out by hand instead of installing a package is
 * that it can be checked against the standard. RFC 6238 Appendix B publishes
 * test vectors; if these pass, staff phones will agree with this server.
 */
class TotpTest extends TestCase
{
    /** The RFC's secret is the ASCII "12345678901234567890". */
    private const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    public function test_the_secret_in_the_rfc_is_the_ascii_string_it_says_it_is(): void
    {
        // If this fails, every vector below is testing the wrong key.
        $this->assertSame('12345678901234567890', Totp::base32Decode(self::RFC_SECRET));
    }

    /**
     * RFC 6238 Appendix B, SHA1 rows. The published values are 8 digits; a
     * 6-digit code is the last six of the same truncation.
     *
     * @return array<string, array{int, string}>
     */
    public static function rfcVectors(): array
    {
        return [
            'T=59' => [59, '94287082'],
            'T=1111111109' => [1111111109, '07081804'],
            'T=1111111111' => [1111111111, '14050471'],
            'T=1234567890' => [1234567890, '89005924'],
            'T=2000000000' => [2000000000, '69279037'],
            'T=20000000000' => [20000000000, '65353130'],
        ];
    }

    /** @dataProvider rfcVectors */
    public function test_it_matches_the_published_vectors(int $time, string $expected8): void
    {
        $this->assertSame(
            substr($expected8, -Totp::DIGITS),
            Totp::codeAt(self::RFC_SECRET, $time),
        );
    }

    public function test_a_code_is_accepted_inside_its_own_step(): void
    {
        $secret = Totp::generateSecret();
        $now = 1_700_000_000;

        $this->assertNotNull(Totp::verify($secret, Totp::codeAt($secret, $now), $now));
    }

    public function test_a_slow_clock_on_the_phone_is_tolerated_but_not_forgiven_forever(): void
    {
        // A phone one step out still works; three steps out (90s) does not,
        // or a code stays live for minutes.
        $secret = Totp::generateSecret();
        $now = 1_700_000_000;

        $this->assertNotNull(Totp::verify($secret, Totp::codeAt($secret, $now - 30), $now));
        $this->assertNotNull(Totp::verify($secret, Totp::codeAt($secret, $now + 30), $now));
        $this->assertNull(Totp::verify($secret, Totp::codeAt($secret, $now - 90), $now));
    }

    public function test_it_reports_which_step_matched(): void
    {
        // The caller needs this to refuse the same code twice.
        $secret = Totp::generateSecret();
        $now = 1_700_000_000;

        $this->assertSame(intdiv($now, 30), Totp::verify($secret, Totp::codeAt($secret, $now), $now));
        $this->assertSame(
            intdiv($now - 30, 30),
            Totp::verify($secret, Totp::codeAt($secret, $now - 30), $now),
        );
    }

    public function test_another_users_code_does_not_work(): void
    {
        $now = 1_700_000_000;
        $mine = Totp::generateSecret();
        $theirs = Totp::generateSecret();

        $this->assertNull(Totp::verify($mine, Totp::codeAt($theirs, $now), $now));
    }

    public function test_junk_is_rejected_without_reaching_the_hmac(): void
    {
        $secret = Totp::generateSecret();

        foreach (['', '1', '12345', '1234567', 'abcdef'] as $bad) {
            $this->assertNull(Totp::verify($secret, $bad), "{$bad} must not be accepted");
        }
    }

    public function test_a_code_typed_with_a_space_still_works(): void
    {
        // Some apps display 123 456.
        $secret = Totp::generateSecret();
        $now = 1_700_000_000;
        $code = Totp::codeAt($secret, $now);

        $spaced = substr($code, 0, 3) . ' ' . substr($code, 3);
        $this->assertNotNull(Totp::verify($secret, $spaced, $now));
    }

    public function test_a_generated_secret_is_the_length_the_apps_expect(): void
    {
        $secret = Totp::generateSecret();

        $this->assertSame(32, strlen(rtrim($secret, '=')), '160 bits is 32 base32 characters');
        $this->assertSame(Totp::SECRET_BYTES, strlen(Totp::base32Decode($secret)));
        $this->assertNotSame(Totp::generateSecret(), $secret, 'secrets must not repeat');
    }

    public function test_base32_round_trips_every_length_of_leftover_bits(): void
    {
        // 5-bit groups do not divide into 8-bit bytes, so each remainder is its
        // own case; a bug here only shows on some secrets.
        foreach (range(1, 20) as $length) {
            $bytes = random_bytes($length);
            $this->assertSame(
                $bytes,
                Totp::base32Decode(Totp::base32Encode($bytes)),
                "{$length} bytes did not survive the round trip",
            );
        }
    }

    public function test_a_secret_retyped_from_the_screen_still_decodes(): void
    {
        // We print it in groups of four; people type it back with the spaces,
        // and phones lowercase it.
        $secret = Totp::generateSecret();
        $shown = Totp::formatSecretForDisplay($secret);

        $this->assertStringContainsString(' ', $shown);
        $this->assertSame(Totp::base32Decode($secret), Totp::base32Decode($shown));
        $this->assertSame(Totp::base32Decode($secret), Totp::base32Decode(strtolower($shown)));
    }

    public function test_the_provisioning_uri_names_the_venue_and_the_account(): void
    {
        $uri = Totp::provisioningUri('JBSWY3DPEHPK3PXP', 'ahmed@bakeandgrill.mv', 'Bake & Grill');

        $this->assertStringStartsWith('otpauth://totp/', $uri);
        // The label identifies the account in a list that may hold a dozen.
        $this->assertStringContainsString('Bake%20%26%20Grill:ahmed%40bakeandgrill.mv', $uri);
        $this->assertStringContainsString('secret=JBSWY3DPEHPK3PXP', $uri);
        $this->assertStringContainsString('period=30', $uri);
        $this->assertStringContainsString('digits=6', $uri);
    }
}
