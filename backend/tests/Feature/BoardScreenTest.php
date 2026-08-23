<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The /board kiosk page.
 *
 * The page itself is a shell — it renders no order data server-side, which
 * is what makes serving it to anyone safe. The tests below pin that: the
 * shell is public, and the orders are not in it.
 */
class BoardScreenTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_screen_loads_without_anyone_signing_in(): void
    {
        // A kiosk is powered on by whoever opens the shop. If the shell
        // needed a login, the screen would be dark until someone noticed.
        $this->get('/board')
            ->assertOk()
            ->assertSee('Pair this screen');
    }

    public function test_the_shell_carries_no_order_data(): void
    {
        // The whole security argument for a public shell is that it holds
        // nothing. If an order number ever appears in the HTML, that
        // argument is gone and this test is how we find out.
        Order::factory()->create([
            'order_number' => 'BG-SECRET-1',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'notes' => 'Ring the bell for Aminath',
        ]);

        $html = $this->get('/board')->assertOk()->getContent();

        $this->assertStringNotContainsString('BG-SECRET-1', $html);
        $this->assertStringNotContainsString('Aminath', $html);
        // What the grid holds until the first poll answers.
        $this->assertStringContainsString('Connecting', $html);
    }

    public function test_it_is_kept_out_of_search_results(): void
    {
        // A page listing live orders behind one pasted key does not belong
        // in an index, even though the shell itself is empty.
        $response = $this->get('/board')->assertOk();

        $this->assertSame('noindex, nofollow', $response->headers->get('X-Robots-Tag'));
        $response->assertSee('name="robots" content="noindex, nofollow"', false);
    }

    public function test_it_is_never_cached(): void
    {
        // A cached shell would keep serving a stale build to a screen that
        // is only ever reloaded when someone reboots it.
        $this->assertStringContainsString(
            'no-store',
            (string) $this->get('/board')->assertOk()->headers->get('Cache-Control'),
        );
    }

    public function test_the_kiosk_gets_a_tighter_policy_than_the_public_site(): void
    {
        // An unattended screen holding a year-long token should not be able
        // to reach an analytics host, be framed, or post a form anywhere —
        // the pasted board key is in that form.
        $csp = (string) $this->get('/board')->assertOk()->headers->get('Content-Security-Policy');

        $this->assertStringContainsString("connect-src 'self';", $csp);
        $this->assertStringContainsString("form-action 'none'", $csp);
        $this->assertStringNotContainsString('googletagmanager', $csp);
        $this->assertStringNotContainsString('google-analytics', $csp);

        // Exactly one frame-ancestors — a second copy is ignored by the
        // browser with a console warning, and the ignored one may be ours.
        $this->assertSame(1, substr_count($csp, 'frame-ancestors'), $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);

        // And the page's own inline script has to survive that policy.
        $this->assertMatchesRegularExpression("/script-src 'self' 'nonce-[^']+'/", $csp);
    }

    public function test_the_inline_script_carries_the_nonce_the_policy_names(): void
    {
        // Break this pairing and the board renders a bare shell for ever:
        // the CSP blocks the script, nothing polls, and the screen shows
        // the pairing card with no way past it.
        $response = $this->get('/board')->assertOk();

        preg_match("/'nonce-([^']+)'/", (string) $response->headers->get('Content-Security-Policy'), $fromHeader);
        preg_match('/<script nonce="([^"]+)"/', $response->getContent(), $fromHtml);

        $this->assertNotEmpty($fromHeader[1] ?? null);
        $this->assertSame($fromHeader[1], $fromHtml[1] ?? null);
    }
}
