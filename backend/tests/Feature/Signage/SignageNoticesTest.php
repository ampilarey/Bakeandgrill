<?php

declare(strict_types=1);

namespace Tests\Feature\Signage;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Domains\Signage\Services\SignageNotices;
use App\Domains\Signage\Services\SignageResolver;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Quick notices (owner's shortlist, 2026-09-23): posted from the admin
 * phone, a slide and/or a ticker line, gone by themselves.
 */
final class SignageNoticesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['slug' => 'owner'], ['name' => 'Owner', 'description' => '', 'is_active' => true]);
        Role::firstOrCreate(['slug' => 'staff'], ['name' => 'Staff', 'description' => '', 'is_active' => true]);
        PermissionCatalogSync::sync();
    }

    private function user(string $role): User
    {
        return User::create([
            'name' => ucfirst($role),
            'email' => $role . '-notices@test.com',
            'password' => Hash::make('password'),
            'role_id' => Role::where('slug', $role)->value('id'),
            'is_active' => true,
        ]);
    }

    public function test_a_notice_becomes_a_slide_at_the_front_and_a_line_ahead_of_the_ticker(): void
    {
        Sanctum::actingAs($this->user('owner'), ['staff']);

        $res = $this->postJson('/api/admin/signage/notices', [
            'text' => 'Kitchen closes in 20 minutes',
            'text_dv' => 'ބަދިގެ ބަންދުވަނީ',
            'look' => 'warning',
            'show' => 'both',
            'minutes' => 20,
        ])->assertCreated();
        $id = $res->json('data.id');
        $this->assertNotEmpty($id);
        $this->assertNotNull($res->json('data.expires_at'));

        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v-n1');

        $this->assertSame('notice-' . $id, $cfg['slides'][0]['id'], 'the notice slide leads the loop');
        $this->assertSame('notice:warning', $cfg['slides'][0]['template_origin']);
        $this->assertSame($res->json('data.expires_at'), $cfg['slides'][0]['expires_at']);
        $texts = array_column($cfg['slides'][0]['elements'], 'text');
        $this->assertContains('Kitchen closes in 20 minutes', $texts);
        $this->assertSame('ބަދިގެ ބަންދުވަނީ', $cfg['slides'][0]['elements'][1]['text_dv']);

        $this->assertTrue($cfg['banner']['enabled']);
        $this->assertSame('notice-' . $id, $cfg['banner']['banners'][0]['id']);
        $this->assertStringContainsString('Kitchen closes', $cfg['banner']['banners'][0]['custom_text']);
        $this->assertSame($res->json('data.expires_at'), $cfg['banner']['banners'][0]['expires_at']);

        // Listed in the overview; removed on request.
        $this->getJson('/api/admin/signage')->assertOk()->assertJsonPath('notices.0.id', $id);
        $this->deleteJson("/api/admin/signage/notices/{$id}")->assertOk()->assertJsonPath('ok', true)->assertJsonPath('notices', []);
        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v-n2');
        $this->assertStringStartsNotWith('notice-', $cfg['slides'][0]['id']);
    }

    public function test_ticker_only_and_slide_only_and_expiry(): void
    {
        Sanctum::actingAs($this->user('owner'), ['staff']);
        $this->postJson('/api/admin/signage/notices', ['text' => 'Ticker only', 'show' => 'ticker'])->assertCreated();
        $this->postJson('/api/admin/signage/notices', ['text' => 'Slide only', 'show' => 'slide', 'look' => 'celebrate', 'minutes' => 1])->assertCreated();

        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v-n3');
        $noticeSlides = array_values(array_filter($cfg['slides'], static fn ($s) => str_starts_with($s['id'], 'notice-')));
        $this->assertCount(1, $noticeSlides);
        $this->assertSame('notice:celebrate', $noticeSlides[0]['template_origin']);
        $lines = array_values(array_filter($cfg['banner']['banners'], static fn ($b) => str_starts_with($b['id'], 'notice-')));
        $this->assertCount(1, $lines);
        $this->assertSame('Ticker only', $lines[0]['custom_text']);

        // Two minutes on, the timed one is gone and the open-ended one stays.
        $later = Carbon::now()->addMinutes(2);
        $all = SignageNotices::all($later);
        $this->assertCount(1, $all);
        $this->assertSame('Ticker only', $all[0]['text']);
        $cfg = app(SignageResolver::class)->resolveFresh('default', $later, null, 'v-n4');
        $this->assertSame([], array_values(array_filter($cfg['slides'], static fn ($s) => str_starts_with($s['id'], 'notice-'))));
    }

    public function test_notices_stay_out_of_emergency_mode(): void
    {
        Sanctum::actingAs($this->user('owner'), ['staff']);
        $this->postJson('/api/admin/signage/notices', ['text' => 'Hello'])->assertCreated();
        SiteSetting::set('signage_emergency', 'closed');
        SiteSetting::bust();

        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v-n5');
        $this->assertCount(1, $cfg['slides']);
        $this->assertStringStartsWith('emergency:', $cfg['slides'][0]['template_origin']);
    }

    public function test_sold_out_minutes_setting_round_trips_to_the_board(): void
    {
        Sanctum::actingAs($this->user('owner'), ['staff']);
        $this->getJson('/api/admin/signage')->assertOk()->assertJsonPath('settings.sold_out_badge_minutes', 20);
        $this->putJson('/api/admin/signage/settings', ['sold_out_badge_minutes' => 45])->assertOk()
            ->assertJsonPath('settings.sold_out_badge_minutes', 45);
        $cfg = app(SignageResolver::class)->resolveFresh('default', Carbon::now(), null, 'v-n6');
        $this->assertSame(45, $cfg['sold_out_badge_minutes']);
        $this->putJson('/api/admin/signage/settings', ['sold_out_badge_minutes' => 999])->assertStatus(422);
    }

    public function test_posting_needs_the_signage_permission_and_a_text(): void
    {
        $this->postJson('/api/admin/signage/notices', ['text' => 'x'])->assertUnauthorized();
        Sanctum::actingAs($this->user('staff'), ['staff']);
        $this->postJson('/api/admin/signage/notices', ['text' => 'x'])->assertForbidden();
        Sanctum::actingAs($this->user('owner'), ['staff']);
        $this->postJson('/api/admin/signage/notices', ['text' => ''])->assertStatus(422);
        $this->postJson('/api/admin/signage/notices', ['text' => 'ok', 'look' => 'neon'])->assertStatus(422);
    }
}
