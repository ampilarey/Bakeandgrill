<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\DhivehiFont;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DhivehiFontUploadTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsOwner(): void
    {
        $role = Role::firstOrCreate(
            ['slug' => 'owner'],
            ['name' => 'Owner', 'description' => '', 'is_active' => true],
        );
        PermissionCatalogSync::sync();
        $user = User::create([
            'name' => 'Font Owner',
            'email' => 'dhivehi-font@test.local',
            'password' => Hash::make('password'),
            'role_id' => $role->id,
            'pin_hash' => Hash::make('1234'),
            'is_active' => true,
        ]);
        Sanctum::actingAs($user, ['staff']);
    }

    public function test_registry_exposes_dhivehi_font_as_public_font_on_both_apps(): void
    {
        $block = ContentRegistry::block('dhivehi_font');
        $this->assertNotNull($block);
        $this->assertSame('font', $block['type'] ?? null);
        $this->assertTrue((bool) ($block['public'] ?? false));
        $this->assertTrue(ContentRegistry::targetsApp('dhivehi_font', 'website'));
        $this->assertTrue(ContentRegistry::targetsApp('dhivehi_font', 'order_app'));
        $this->assertFalse(\App\Domains\Settings\OpsOwnedContent::isWriteForbidden('dhivehi_font'));
    }

    public function test_upload_accepts_a_faruma_ttf_and_does_not_write_live_setting(): void
    {
        $this->actingAsOwner();
        Storage::fake('public');
        SiteSetting::set('dhivehi_font', '', 'website', 'en');

        $tmp = tempnam(sys_get_temp_dir(), 'dvfont');
        $this->assertNotFalse($tmp);
        file_put_contents($tmp, file_get_contents(public_path('fonts/a_faruma.ttf')));
        $file = new UploadedFile($tmp, 'a_faruma.ttf', 'font/ttf', null, true);

        $res = $this->post('/api/admin/content/upload-font', [
            'key' => 'dhivehi_font',
            'scope' => 'website',
            'locale' => 'en',
            'file' => $file,
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json();

        $this->assertTrue(DhivehiFont::isSafePublicUrl($res['url']));
        $this->assertSame('dhivehi_font', $res['key']);
        $this->assertSame('website', $res['scope']);
        $this->assertTrue(
            SiteSetting::getScoped('dhivehi_font', 'website') === null
            || SiteSetting::getScoped('dhivehi_font', 'website') === '',
        );
    }

    public function test_upload_rejects_a_jpeg_renamed_as_a_font(): void
    {
        $this->actingAsOwner();
        $img = imagecreatetruecolor(8, 8);
        $tmp = tempnam(sys_get_temp_dir(), 'notfont');
        imagejpeg($img, $tmp, 80);
        imagedestroy($img);
        $file = new UploadedFile($tmp, 'fake.ttf', 'font/ttf', null, true);

        $this->post('/api/admin/content/upload-font', [
            'key' => 'dhivehi_font',
            'scope' => 'website',
            'file' => $file,
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'That file is not a real font (TTF, OTF, WOFF or WOFF2).']);
    }

    public function test_upload_rejects_latin_only_woff2(): void
    {
        $this->actingAsOwner();
        $tmp = tempnam(sys_get_temp_dir(), 'latin');
        file_put_contents($tmp, file_get_contents(public_path('fonts/plus-jakarta-sans-400.woff2')));
        $file = new UploadedFile($tmp, 'plus-jakarta.woff2', 'font/woff2', null, true);

        $this->post('/api/admin/content/upload-font', [
            'key' => 'dhivehi_font',
            'scope' => 'order_app',
            'file' => $file,
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This font has no Thaana (Dhivehi) letters. Upload a Thaana-capable TTF, OTF, WOFF or WOFF2.']);
    }

    public function test_css_route_defaults_until_a_safe_url_is_published(): void
    {
        $this->get('/css/dhivehi-font.css?app=website')
            ->assertOk()
            ->assertHeader('Content-Type', 'text/css; charset=UTF-8')
            ->assertSee('default A_Faruma', false)
            ->assertDontSee('@font-face', false);

        SiteSetting::set('dhivehi_font', '/storage/fonts/abc123def456.woff2', 'website', 'en');
        SiteSetting::set('dhivehi_font', '/storage/fonts/order789.woff2', 'order_app', 'en');

        $website = $this->get('/css/dhivehi-font.css?app=website')
            ->assertOk()
            ->getContent();
        $this->assertStringContainsString('@font-face', $website);
        $this->assertStringContainsString('/storage/fonts/abc123def456.woff2', $website);
        $this->assertStringContainsString("--font-dhivehi: 'BakeDhivehi'", $website);
        $this->assertStringNotContainsString('order789', $website);

        $order = $this->get('/css/dhivehi-font.css?app=order_app')
            ->assertOk()
            ->getContent();
        $this->assertStringContainsString('/storage/fonts/order789.woff2', $order);
        $this->assertStringNotContainsString('abc123def456', $order);
    }

    public function test_css_route_ignores_unsafe_published_urls(): void
    {
        SiteSetting::set('dhivehi_font', 'https://evil.example/x.woff2', 'website', 'en');

        $this->get('/css/dhivehi-font.css?app=website')
            ->assertOk()
            ->assertSee('default A_Faruma', false)
            ->assertDontSee('evil.example', false);
    }

    public function test_css_route_returns_etag_304(): void
    {
        $first = $this->get('/css/dhivehi-font.css?app=website')->assertOk();
        $etag = $first->headers->get('ETag');
        $this->assertNotEmpty($etag);

        $this->get('/css/dhivehi-font.css?app=website', ['If-None-Match' => $etag])
            ->assertStatus(304);
    }
}
