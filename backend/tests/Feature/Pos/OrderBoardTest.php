<?php

declare(strict_types=1);

namespace Tests\Feature\Pos;

use App\Models\Category;
use App\Models\Item;
use App\Models\Order;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The wall-mounted order boards.
 *
 * Most of this file is about the credential rather than the display, because
 * that is where the risk is. A board is an unattended screen in a room, its
 * token lives for a year, and it shows customer names — so the questions
 * worth pinning are what that token can reach and what it cannot.
 *
 * The one that matters most is the last test: a token lifted off a wall screen
 * must not be able to ring a sale.
 */
class OrderBoardTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );

        $this->owner = User::create([
            'name' => 'Owner',
            'email' => 'owner@board-test.mv',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('7412'),
            'is_active' => true,
        ]);
    }

    /** A real board token, as the admin would issue one. */
    private function boardToken(string $name = 'Kitchen'): string
    {
        return $this->owner->createToken(
            'board-' . $name,
            ['board'],
            now()->addDays((int) config('sanctum.board_token_ttl_days')),
        )->plainTextToken;
    }

    /**
     * A real staff bearer token rather than Sanctum::actingAs.
     *
     * actingAs pins the guard's user resolver for the rest of the test, so a
     * later request would still be answered as the acting staff user — which
     * would quietly hide whether the board token works at all.
     */
    private function staffToken(): string
    {
        return $this->owner->createToken('staff-pos-board-test', ['staff'])->plainTextToken;
    }

    /**
     * Send the next request as this token, and only this token.
     *
     * RequestGuard caches the user it resolved, and that cache outlives a
     * single request inside one test (setRequest does not clear it). Without
     * the flush, a second request in the same test is answered as the *first*
     * token's owner — so "the board token works" and "the revoked token is
     * refused" would both be measuring the staff token instead.
     */
    private function withBearer(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function activeOrder(array $attrs = []): Order
    {
        return Order::factory()->create(array_merge([
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'type' => 'takeaway',
        ], $attrs));
    }

    // ── What the board shows ──────────────────────────────────────────────

    public function test_a_board_reads_the_active_orders(): void
    {
        $order = $this->activeOrder(['order_number' => 'BG-BOARD-1']);

        $response = $this->withBearer($this->boardToken())
            ->getJson('/api/board/orders')
            ->assertOk();

        $this->assertSame('BG-BOARD-1', $response->json('orders.0.order_number'));
        $this->assertSame($order->id, $response->json('orders.0.id'));
        $this->assertNotNull($response->json('generated_at'));
    }

    public function test_it_says_which_orders_came_from_a_customer(): void
    {
        // The whole reason for the screen: an online order arriving has to be
        // obvious from across the room.
        $fromApp = $this->activeOrder(['user_id' => null, 'order_number' => 'BG-APP-9']);
        $fromTill = $this->activeOrder(['user_id' => $this->owner->id, 'order_number' => 'BG-TILL-9']);

        $rows = collect(
            $this->withBearer($this->boardToken())->getJson('/api/board/orders')->assertOk()->json('orders'),
        )->keyBy('order_number');

        $this->assertTrue($rows['BG-APP-9']['is_customer_placed']);
        $this->assertFalse($rows['BG-TILL-9']['is_customer_placed']);
        $this->assertSame('Owner', $rows['BG-TILL-9']['placed_by']);
        $this->assertNull($rows['BG-APP-9']['placed_by']);

        $this->assertSame($fromApp->id, $rows['BG-APP-9']['id']);
        $this->assertSame($fromTill->id, $rows['BG-TILL-9']['id']);
    }

    public function test_it_shows_no_money_and_no_address(): void
    {
        // A wall screen is not a receipt. Anything a passing customer should
        // not read has no business being in this payload at all — filtering it
        // in the UI would still put it on the wire.
        $this->activeOrder(['order_number' => 'BG-BOARD-2']);

        $row = $this->withBearer($this->boardToken())
            ->getJson('/api/board/orders')->assertOk()->json('orders.0');

        foreach (['total', 'total_laar', 'subtotal', 'payment_status', 'customer', 'delivery_address'] as $leak) {
            $this->assertArrayNotHasKey($leak, $row, "the board must not carry {$leak}");
        }
    }

    public function test_a_finished_order_drops_off_the_board(): void
    {
        $this->activeOrder(['order_number' => 'BG-LIVE']);
        $this->activeOrder(['order_number' => 'BG-DONE', 'status' => 'completed']);

        $numbers = collect(
            $this->withBearer($this->boardToken())->getJson('/api/board/orders')->assertOk()->json('orders'),
        )->pluck('order_number')->all();

        $this->assertContains('BG-LIVE', $numbers);
        $this->assertNotContains('BG-DONE', $numbers);
    }

    public function test_an_unfired_future_order_stays_off_the_board(): void
    {
        // Same hold the KDS uses: a collect-tomorrow order is not today's work
        // and would otherwise sit on the screen all day.
        $this->activeOrder([
            'order_number' => 'BG-TOMORROW',
            'fulfil_date' => now()->addDay()->toDateString(),
            'fired_at' => null,
        ]);

        $numbers = collect(
            $this->withBearer($this->boardToken())->getJson('/api/board/orders')->assertOk()->json('orders'),
        )->pluck('order_number')->all();

        $this->assertNotContains('BG-TOMORROW', $numbers);
    }

    // ── The credential ────────────────────────────────────────────────────

    public function test_the_board_feed_refuses_anonymous_readers(): void
    {
        $this->getJson('/api/board/orders')->assertStatus(401);
    }

    public function test_a_staff_token_cannot_read_the_board_feed(): void
    {
        // Not an inconvenience — it is the point. The board route accepts one
        // ability, so "can read the board" stays a property of board tokens
        // rather than of being logged in.
        $this->withBearer($this->staffToken())
            ->getJson('/api/board/orders')
            ->assertStatus(403);
    }

    public function test_a_signed_in_session_cannot_read_the_board_feed(): void
    {
        // The subtle one. A stateful Sanctum request resolves through the web
        // guard and carries a TransientToken, whose can() answers true to
        // everything — so an ability check alone would let every logged-in
        // staff browser read the feed. Note this is the real session path,
        // not Sanctum::actingAs, which mocks a personal access token instead.
        $this->actingAs($this->owner, 'web');

        $this->getJson('/api/board/orders')->assertStatus(403);
    }

    public function test_a_board_token_cannot_ring_a_sale(): void
    {
        // The one that matters. A token lifted off a screen on the wall must
        // buy an attacker nothing beyond looking at the screen they already
        // stole it from.
        $category = Category::create([
            'name' => 'Shorteats', 'slug' => 'shorteats', 'is_active' => true, 'sort_order' => 1,
        ]);
        $item = Item::create([
            'category_id' => $category->id, 'name' => 'Bajiya', 'base_price' => 5,
            'sku' => 'BOARD-1', 'is_active' => true, 'is_available' => true,
        ]);

        $this->withBearer($this->boardToken())
            ->postJson('/api/orders', [
                'type' => 'takeaway',
                'items' => [['item_id' => $item->id, 'quantity' => 1]],
            ])
            ->assertForbidden();
    }

    public function test_a_board_token_cannot_read_the_full_orders_endpoint(): void
    {
        // /api/orders carries totals, payment state and customer records. The
        // board's thin feed exists precisely so a screen never needs that.
        $this->withBearer($this->boardToken())
            ->getJson('/api/orders?active_only=1')
            ->assertForbidden();
    }

    // ── Issuing and revoking ──────────────────────────────────────────────

    public function test_an_owner_issues_a_token_and_it_is_shown_once(): void
    {
        $staff = $this->staffToken();

        $created = $this->withBearer($staff)
            ->postJson('/api/admin/boards', ['name' => 'Counter'])
            ->assertCreated();

        $plain = $created->json('token');
        $this->assertNotEmpty($plain);

        // Usable straight away…
        $this->withBearer($plain)->getJson('/api/board/orders')->assertOk();

        // …and never handed back again.
        $listed = $this->withBearer($staff)->getJson('/api/admin/boards')->assertOk()->json('boards');
        $this->assertNotEmpty($listed);
        $this->assertArrayNotHasKey('token', $listed[0]);
        $this->assertSame('board-Counter', $listed[0]['name']);
    }

    public function test_revoking_a_board_stops_it_reading_immediately(): void
    {
        $staff = $this->staffToken();
        $created = $this->withBearer($staff)
            ->postJson('/api/admin/boards', ['name' => 'Kitchen'])->assertCreated();
        $plain = $created->json('token');
        $id = $created->json('id');

        $this->withBearer($plain)->getJson('/api/board/orders')->assertOk();

        $this->withBearer($staff)->deleteJson('/api/admin/boards/' . $id)->assertOk();

        // A revoked screen must stop showing customer names, not go stale.
        $this->withBearer($plain)->getJson('/api/board/orders')->assertStatus(401);
    }

    public function test_revoke_cannot_be_turned_on_a_staff_session(): void
    {
        // The endpoint is scoped to board-% names so it never becomes a way to
        // sign a cashier — or an owner — out from under themselves.
        $victim = $this->owner->createToken('staff-pos-' . $this->owner->id, ['staff']);

        $this->withBearer($this->staffToken())
            ->deleteJson('/api/admin/boards/' . $victim->accessToken->id)
            ->assertNotFound();

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $victim->accessToken->id]);
    }

    public function test_a_board_token_cannot_issue_another_board_token(): void
    {
        // Otherwise one stolen screen mints permanent credentials at will.
        $this->withBearer($this->boardToken())
            ->postJson('/api/admin/boards', ['name' => 'Rogue'])
            ->assertForbidden();
    }
}
