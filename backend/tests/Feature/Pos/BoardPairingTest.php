<?php

declare(strict_types=1);

namespace Tests\Feature\Pos;

use App\Models\BoardPairing;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Pairing a screen that has no keyboard.
 *
 * A television cannot have a 50-character key typed into it, so it shows six
 * characters and the owner types those on their phone instead.
 *
 * The whole security argument rests on one split, and most of this file exists
 * to hold it: the **code** is public the instant it appears on a screen in a
 * room, so it may only ever identify a screen to the owner. The **poll token**
 * is held by the browser that started the handshake and never displayed, and
 * it is the only thing that may collect a key. Collapse those two and
 * photographing a television becomes enough to steal the credential.
 */
class BoardPairingTest extends TestCase
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
            'email' => 'owner@pairing-test.mv',
            'password' => Hash::make('secret'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('7412'),
            'is_active' => true,
        ]);
    }

    private function staffToken(): string
    {
        return $this->owner->createToken('staff-pairing-test', ['staff'])->plainTextToken;
    }

    /** @see OrderBoardTest::withBearer — guards cache the user they resolved. */
    private function withBearer(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withToken($token);
    }

    private function startPairing(): array
    {
        return $this->postJson('/api/board/pair/start')->assertCreated()->json();
    }

    // ── The happy path ────────────────────────────────────────────────────

    public function test_a_screen_can_ask_to_be_paired_without_any_credential(): void
    {
        // The point of the whole flow. An unpaired television has nothing to
        // authenticate with — that is the problem, not an oversight.
        $body = $this->postJson('/api/board/pair/start')->assertCreated()->json();

        $this->assertMatchesRegularExpression('/^[A-Z2-9]{6}$/', $body['code']);
        $this->assertNotEmpty($body['poll_token']);
        $this->assertNotSame($body['code'], $body['poll_token']);
    }

    public function test_the_screen_waits_until_an_owner_approves(): void
    {
        $start = $this->startPairing();

        $this->postJson('/api/board/pair/status', ['poll_token' => $start['poll_token']])
            ->assertOk()
            ->assertJson(['status' => 'waiting', 'code' => $start['code']]);
    }

    public function test_typing_the_code_pairs_the_screen_and_it_collects_a_working_key(): void
    {
        $start = $this->startPairing();

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen'])
            ->assertCreated();

        $collected = $this->withHeaders([])
            ->postJson('/api/board/pair/status', ['poll_token' => $start['poll_token']])
            ->assertOk()
            ->assertJson(['status' => 'approved'])
            ->json();

        // The key has to actually work, not merely be a string.
        $this->withBearer($collected['token'])
            ->getJson('/api/board/orders')
            ->assertOk();
    }

    public function test_the_owner_may_type_the_code_in_any_case_or_spacing(): void
    {
        // It is read off a television and typed on a phone, which will
        // helpfully lowercase it and may add a space.
        $start = $this->startPairing();

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', [
                'code' => ' ' . strtolower($start['code']) . ' ',
                'name' => 'Counter',
            ])
            ->assertCreated();
    }

    public function test_the_paired_screen_appears_in_the_boards_list(): void
    {
        $start = $this->startPairing();

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen'])
            ->assertCreated();

        $names = collect(
            $this->withBearer($this->staffToken())->getJson('/api/admin/boards')->assertOk()->json('boards'),
        )->pluck('name');

        // So it can be revoked later like any other board.
        $this->assertContains('board-Kitchen', $names);
    }

    // ── The split that makes it safe ──────────────────────────────────────

    public function test_the_code_alone_cannot_collect_the_key(): void
    {
        // THE test. The code is on a screen in a room — a customer can read it,
        // a phone camera can capture it. If it were also enough to poll with,
        // pairing would hand the credential to whoever photographed the wall.
        $start = $this->startPairing();

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen'])
            ->assertCreated();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/board/pair/status', ['poll_token' => $start['code']])
            ->assertStatus(404);
    }

    public function test_a_guessed_poll_token_gets_nothing(): void
    {
        $this->startPairing();

        $this->postJson('/api/board/pair/status', ['poll_token' => str_repeat('a', 48)])
            ->assertStatus(404);
    }

    public function test_a_second_screen_cannot_collect_the_first_screens_key(): void
    {
        // Two televisions being set up in one afternoon must not cross over.
        $kitchen = $this->startPairing();
        $counter = $this->startPairing();

        $this->assertNotSame($kitchen['code'], $counter['code']);

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => $kitchen['code'], 'name' => 'Kitchen'])
            ->assertCreated();

        // The counter screen was not approved, so it keeps waiting.
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/board/pair/status', ['poll_token' => $counter['poll_token']])
            ->assertOk()
            ->assertJson(['status' => 'waiting']);
    }

    public function test_the_key_is_handed_over_only_once(): void
    {
        // After collection the row is gone, so a replayed poll token — from a
        // proxy log, a crash dump, a shared browser — buys nothing.
        $start = $this->startPairing();

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen'])
            ->assertCreated();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/board/pair/status', ['poll_token' => $start['poll_token']])
            ->assertOk()->assertJson(['status' => 'approved']);

        $this->postJson('/api/board/pair/status', ['poll_token' => $start['poll_token']])
            ->assertStatus(404);
    }

    public function test_the_plaintext_key_is_not_readable_in_the_database(): void
    {
        // It sits there between approval and collection. Encrypted at rest, so
        // a database dump taken in that window does not hand it over.
        $start = $this->startPairing();

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen'])
            ->assertCreated();

        $raw = (string) \DB::table('board_pairings')->where('code', $start['code'])->value('board_token');

        $this->assertNotEmpty($raw);
        $this->assertStringNotContainsString('|', $raw, 'a Sanctum key in the clear would contain a pipe');
        $this->assertSame(
            $start['code'],
            BoardPairing::where('code', $start['code'])->first()->code,
            'and it still decrypts through the model',
        );
    }

    // ── Who may approve ───────────────────────────────────────────────────

    public function test_an_anonymous_visitor_cannot_approve_a_screen(): void
    {
        $start = $this->startPairing();

        $this->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Rogue'])
            ->assertStatus(401);
    }

    public function test_a_board_token_cannot_approve_another_screen(): void
    {
        // Otherwise one paired television mints credentials for more.
        $existing = $this->owner->createToken('board-Kitchen', ['board'])->plainTextToken;
        $start = $this->startPairing();

        $this->withBearer($existing)
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Rogue'])
            ->assertForbidden();
    }

    // ── Expiry and mistakes ───────────────────────────────────────────────

    public function test_an_expired_code_cannot_be_approved(): void
    {
        // A code left on a screen overnight should not still work in the
        // morning, when nobody remembers which screen it belonged to.
        $start = $this->startPairing();
        BoardPairing::query()->update(['expires_at' => now()->subMinute()]);

        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen'])
            ->assertStatus(404);
    }

    public function test_an_expired_screen_is_told_to_start_again(): void
    {
        $start = $this->startPairing();
        BoardPairing::query()->update(['expires_at' => now()->subMinute()]);

        $this->postJson('/api/board/pair/status', ['poll_token' => $start['poll_token']])
            ->assertStatus(404)
            ->assertJson(['status' => 'expired']);
    }

    public function test_an_unknown_code_says_so_rather_than_failing_silently(): void
    {
        $this->withBearer($this->staffToken())
            ->postJson('/api/admin/boards/claim', ['code' => 'ZZZZZZ', 'name' => 'Kitchen'])
            ->assertStatus(404)
            ->assertJsonFragment(['message' => 'No screen is showing that code. Check the screen — codes expire after 15 minutes.']);
    }

    public function test_the_same_screen_cannot_be_paired_twice(): void
    {
        // Two owners typing the same code should not produce two keys, only
        // one of which the screen ever collects — the other would be a live
        // credential nobody knows exists.
        $start = $this->startPairing();
        $staff = $this->staffToken();

        $this->withBearer($staff)
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen'])
            ->assertCreated();

        $this->withBearer($staff)
            ->postJson('/api/admin/boards/claim', ['code' => $start['code'], 'name' => 'Kitchen again'])
            ->assertStatus(409);

        $this->assertSame(1, \DB::table('personal_access_tokens')->where('name', 'like', 'board-%')->count());
    }

    public function test_codes_avoid_characters_that_are_misread_on_a_screen(): void
    {
        // Somebody reads these off a television across a room and types them
        // on a phone. O/0 and I/1/L cost a support call every time they appear.
        // Driven through the model rather than the route so the sample is big
        // enough to be worth something — the endpoint is rate limited, and
        // rightly so (see the next test).
        for ($i = 0; $i < 200; $i++) {
            $code = BoardPairing::start()['pairing']->code;
            $this->assertMatchesRegularExpression('/^[A-Z2-9]{6}$/', $code, "got {$code}");
            $this->assertDoesNotMatchRegularExpression('/[O0I1L]/', $code, "got {$code}");
        }
    }

    public function test_two_screens_never_share_a_live_code(): void
    {
        // The owner types six characters to say *which* screen they mean. Two
        // live screens showing the same code would make that ambiguous, and
        // one of them would collect a key meant for the other.
        $codes = [];
        for ($i = 0; $i < 200; $i++) {
            $codes[] = BoardPairing::start()['pairing']->code;
        }

        $this->assertCount(200, array_unique($codes));
    }

    public function test_the_schema_is_valid_on_mysql_not_only_sqlite(): void
    {
        // This table failed to create on production while every test here
        // passed, because the suite runs on SQLite and production is MySQL.
        //
        // Only the *first* TIMESTAMP column in a MySQL table gets an implicit
        // CURRENT_TIMESTAMP default. A later NOT NULL one with no default
        // falls back to '0000-00-00 00:00:00', which strict mode rejects:
        //   SQLSTATE[42000] 1067 Invalid default value for 'expires_at'
        //
        // Checked against the migration source rather than by running it:
        // there is no MySQL server in the test environment, and the SQLite one
        // the suite does have is exactly what failed to notice.
        $source = file_get_contents(
            database_path('migrations/2026_08_23_120000_create_board_pairings_table.php'),
        );

        preg_match_all('/->timestamp\(\'(\w+)\'\)((?:->\w+\([^)]*\))*)/', $source, $matches, PREG_SET_ORDER);
        $this->assertNotEmpty($matches, 'expected timestamp columns to check');

        $offenders = [];
        foreach ($matches as [, $column, $modifiers]) {
            $safe = str_contains($modifiers, 'nullable()')
                || str_contains($modifiers, 'useCurrent()')
                || str_contains($modifiers, 'default(');
            if (!$safe) {
                $offenders[] = $column;
            }
        }

        $this->assertSame([], $offenders, implode(', ', $offenders)
            . ': a NOT NULL timestamp needs nullable(), useCurrent() or default() '
            . 'unless it is the first timestamp column in the table.');
    }

    public function test_starting_a_handshake_is_rate_limited(): void
    {
        // The only public write in the whole board feature, and each call
        // writes a row. Without a limit it is a free way to fill a table.
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/board/pair/start')->assertCreated();
        }

        $this->postJson('/api/board/pair/start')->assertStatus(429);
    }
}
