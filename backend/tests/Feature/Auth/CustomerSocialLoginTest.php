<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Domains\Auth\Services\CustomerOtpService;
use App\Domains\Auth\SocialLogin\Jwt;
use App\Models\Customer;
use App\Models\CustomerSocialAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Customer sign-in with Google, Facebook and Apple (iruali import plan,
 * feature 1): a linked sign-in or a matching checked email signs in; anything
 * else waits for the phone and is linked by the phone code; staff are refused.
 */
class CustomerSocialLoginTest extends TestCase
{
    use RefreshDatabase;

    /** What Google's token endpoint answers next. */
    private string $idToken = '';

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['services.google.client_id' => 'gid', 'services.google.client_secret' => 'gsecret']);
        Http::fake(['oauth2.googleapis.com/*' => fn () => Http::response(['id_token' => $this->idToken, 'access_token' => 'x'])]);
        // The order app's API calls carry its origin, so they share the browser session.
        $this->withHeaders(['Origin' => config('app.url'), 'Referer' => config('app.url') . '/order/']);
    }

    /** Start at Google, then come back with Google's answer for this person. */
    private function signInWithGoogle(array $claims): \Illuminate\Testing\TestResponse
    {
        $start = $this->get('/auth/social/google?return=/order/menu');
        $start->assertRedirect();
        $this->assertStringStartsWith('https://accounts.google.com/', (string) $start->headers->get('Location'));
        $attempt = session('customer_social.attempt');

        $this->idToken = Jwt::base64UrlEncode('{"alg":"none"}') . '.' . Jwt::base64UrlEncode((string) json_encode($claims + [
            'iss' => 'https://accounts.google.com', 'aud' => 'gid', 'exp' => time() + 600, 'nonce' => $attempt['nonce'],
        ])) . '.sig';

        return $this->get('/auth/social/google/callback?' . http_build_query(['code' => 'abc', 'state' => $attempt['state']]));
    }

    public function test_a_checked_email_that_google_vouches_for_signs_in_and_links(): void
    {
        $customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607771111', 'email' => 'aisha@example.mv', 'email_verified_at' => now(), 'is_active' => true]);

        $this->signInWithGoogle(['sub' => 'g-1', 'email' => 'Aisha@example.mv', 'email_verified' => true, 'name' => 'Aisha A'])
            ->assertRedirect('/order/menu?social=ok');

        $this->assertAuthenticatedAs($customer, 'customer');
        $this->assertDatabaseHas('customer_social_accounts', ['customer_id' => $customer->id, 'provider' => 'google', 'subject' => 'g-1']);

        // Next time the link alone is enough, whatever the email says.
        auth('customer')->logout();
        $this->signInWithGoogle(['sub' => 'g-1', 'email' => 'new@example.mv', 'email_verified' => false])->assertRedirect('/order/menu?social=ok');
        $this->assertAuthenticatedAs($customer, 'customer');
    }

    public function test_an_unchecked_email_does_not_match_and_the_phone_code_finishes_the_link(): void
    {
        $customer = Customer::create(['name' => 'Ali', 'phone' => '+9607772222', 'email' => 'ali@example.mv', 'is_active' => true]);

        $this->signInWithGoogle(['sub' => 'g-2', 'email' => 'ali@example.mv', 'email_verified' => true, 'name' => 'Ali'])
            ->assertRedirect('/order/menu?social=phone');
        $this->assertGuest('customer');
        $this->getJson('/api/auth/customer/social')->assertOk()->assertJsonPath('pending.label', 'Google');

        $code = app(CustomerOtpService::class)->issue('+9607772222', 'login');
        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '+9607772222', 'otp' => $code])
            ->assertOk()->assertJsonPath('social_linked', 'Google');

        $this->assertDatabaseHas('customer_social_accounts', ['customer_id' => $customer->id, 'provider' => 'google', 'subject' => 'g-2']);
        $this->getJson('/api/auth/customer/social')->assertJsonPath('pending', null);
    }

    public function test_a_new_person_gets_their_google_email_as_checked_once_the_phone_proves_them(): void
    {
        $this->signInWithGoogle(['sub' => 'g-3', 'email' => 'new@example.mv', 'email_verified' => true, 'name' => 'Mariyam'])->assertRedirect('/order/menu?social=phone');

        $code = app(CustomerOtpService::class)->issue('+9607773333', 'login');
        $this->postJson('/api/auth/customer/otp/verify', ['phone' => '+9607773333', 'otp' => $code])->assertOk();

        $customer = Customer::query()->where('phone', '+9607773333')->firstOrFail();
        $this->assertSame('Mariyam', $customer->name);
        $this->assertTrue($customer->hasVerifiedEmail());
    }

    public function test_staff_cannot_sign_in_this_way(): void
    {
        $this->makeStaff('staff', ['email' => 'cashier@bakeandgrill.mv', 'phone' => '+9607774444']);

        $res = $this->signInWithGoogle(['sub' => 'g-4', 'email' => 'cashier@bakeandgrill.mv', 'email_verified' => true]);

        $this->assertStringContainsString('social=error', (string) $res->headers->get('Location'));
        $this->assertStringContainsString('Staff+sign+in', (string) $res->headers->get('Location'));
        $this->assertSame(0, CustomerSocialAccount::query()->count());
    }

    public function test_a_wrong_state_is_refused_and_an_unknown_return_goes_to_the_account_page(): void
    {
        $this->get('/auth/social/google?return=https://evil.example/x')->assertRedirect();
        $this->assertSame('/order/account', session('customer_social.attempt')['return']);

        $this->get('/auth/social/google/callback?code=abc&state=wrong')
            ->assertRedirect('/order/account?social=error&social_message=' . urlencode('That sign-in took too long or was started in another window. Please try again.'));
    }

    public function test_a_button_shows_only_when_its_keys_are_set(): void
    {
        $this->getJson('/api/auth/customer/social')->assertOk()->assertJsonPath('providers', [['provider' => 'google', 'label' => 'Google']]);
        $this->get('/auth/social/facebook')->assertRedirect('/order/account?social=error&social_message=' . urlencode('That sign-in is not available.'));
    }

    public function test_apples_form_post_is_handed_over_to_the_callback(): void
    {
        $res = $this->post('/auth/social/apple/callback', ['code' => 'c', 'state' => 's']);

        $this->assertMatchesRegularExpression('#/auth/social/apple/callback\?handoff=[A-Za-z0-9]{40}$#', (string) $res->headers->get('Location'));
    }

    public function test_the_customer_sees_and_unlinks_their_sign_ins(): void
    {
        $customer = Customer::create(['name' => 'Aisha', 'phone' => '+9607775555', 'is_active' => true]);
        CustomerSocialAccount::create(['customer_id' => $customer->id, 'provider' => 'google', 'subject' => 'g-5', 'email' => 'a@x.mv']);
        Sanctum::actingAs($customer, ['customer']);

        $this->getJson('/api/customer/me')->assertJsonPath('customer.social_accounts.0.label', 'Google');
        $this->deleteJson('/api/customer/social/google')->assertOk()->assertJsonPath('social_accounts', []);
    }

    public function test_apple_client_secret_is_an_es256_token(): void
    {
        $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        openssl_pkey_export($key, $pem);
        config(['services.apple.client_id' => 'mv.bakeandgrill.web', 'services.apple.team_id' => 'TEAM', 'services.apple.key_id' => 'KEY', 'services.apple.private_key' => $pem]);

        $token = app(\App\Domains\Auth\SocialLogin\AppleProvider::class)->clientSecret();
        [$h, $p, $s] = explode('.', $token);

        $this->assertSame('ES256', json_decode((string) Jwt::base64UrlDecode($h), true)['alg']);
        $this->assertSame('mv.bakeandgrill.web', json_decode((string) Jwt::base64UrlDecode($p), true)['sub']);
        $this->assertSame(64, strlen((string) Jwt::base64UrlDecode($s)));
    }
}
