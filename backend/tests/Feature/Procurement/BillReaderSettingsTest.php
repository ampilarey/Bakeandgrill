<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Domains\Inventory\Bills\BillReaderSettings;
use App\Domains\Inventory\Bills\BillUnreadable;
use App\Domains\Inventory\Bills\BillVision;
use App\Domains\Inventory\Bills\GeminiVision;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-15: "Can you add API key entry to admin so I can switch between
 * Claude, Google etc. if I want."
 */
class BillReaderSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        config(['services.anthropic.key' => null, 'services.gemini.key' => null]);
    }

    private function geminiAnswer(array $over = []): array
    {
        $bill = array_merge([
            'is_bill' => true, 'shop' => 'Corner Shop Pvt Ltd', 'bill_no' => '1001', 'date' => '', 'total' => 234, 'gst_total' => 0, 'note' => '',
            'lines' => [
                ['name' => 'RICE 5KG BAG', 'item_id' => 0, 'new_name' => 'Rice', 'new_unit' => 'kg', 'quantity' => 2, 'unit' => 'bag', 'unit_price' => 85, 'amount' => 170, 'gst' => false, 'unsure' => false],
                ['name' => 'COOKING OIL 2L', 'item_id' => 0, 'new_name' => 'Cooking oil', 'new_unit' => 'litre', 'quantity' => 1, 'unit' => 'bottle', 'unit_price' => 64, 'amount' => 64, 'gst' => false, 'unsure' => false],
            ],
        ], $over);

        return ['candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [
            ['thought' => true, 'text' => 'working it out'],
            ['text' => json_encode($bill)],
        ]]]]];
    }

    public function test_a_key_goes_in_encrypted_and_only_its_last_four_come_back(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->getJson('/api/purchasing/bill-reader')->assertOk()
            ->assertJsonPath('provider', 'claude')
            ->assertJsonPath('providers.0.has_key', false)
            ->assertJsonPath('providers.1.key', 'google');

        $res = $this->putJson('/api/purchasing/bill-reader', [
            'provider' => 'google',
            'keys' => ['google' => '  AIza-secret-key-9f3c  '],
            'models' => ['google' => 'gemini-pro-latest'],
        ])->assertOk();

        $res->assertJsonPath('provider', 'google')
            ->assertJsonPath('providers.1.has_key', true)
            ->assertJsonPath('providers.1.key_hint', '…9f3c')
            ->assertJsonPath('providers.1.key_from', 'admin')
            ->assertJsonPath('providers.1.model', 'gemini-pro-latest');
        $this->assertStringNotContainsString('AIza-secret', $res->getContent());

        $settings = app(BillReaderSettings::class);
        $this->assertSame('AIza-secret-key-9f3c', $settings->key('google'));
        // In the database it is not the key, and the settings list does not carry it.
        $stored = SiteSetting::query()->where('key', 'bill_reader_key_google')->firstOrFail();
        $this->assertStringNotContainsString('AIza', (string) $stored->value);
        $this->assertStringNotContainsString('bill_reader_key_google', $this->getJson('/api/site-settings')->assertOk()->getContent());

        // Not sent, it is kept; sent empty, it is removed.
        $this->putJson('/api/purchasing/bill-reader', ['models' => ['google' => '']])
            ->assertJsonPath('providers.1.has_key', true)->assertJsonPath('providers.1.model', 'gemini-flash-latest');
        $this->putJson('/api/purchasing/bill-reader', ['keys' => ['google' => '']])->assertJsonPath('providers.1.has_key', false);
    }

    public function test_a_key_in_env_is_used_until_one_is_typed(): void
    {
        config(['services.anthropic.key' => 'sk-ant-from-env-1234']);
        Sanctum::actingAs($this->makeOwner(), ['staff']);

        $this->getJson('/api/purchasing/bill-reader')
            ->assertJsonPath('providers.0.key_from', 'env')->assertJsonPath('providers.0.key_hint', '…1234');
        $this->assertTrue(app(BillVision::class)->enabled());

        $this->putJson('/api/purchasing/bill-reader', ['keys' => ['claude' => 'sk-ant-typed-5678']])
            ->assertJsonPath('providers.0.key_from', 'admin')->assertJsonPath('providers.0.key_hint', '…5678');
    }

    public function test_the_picked_service_decides_whether_reading_is_on(): void
    {
        $settings = app(BillReaderSettings::class);
        $settings->setKey('claude', 'sk-ant-abc');
        $this->assertTrue(app(BillVision::class)->enabled());

        // Google picked with no Google key: off, however many other keys there are.
        $settings->setProvider('google');
        $this->assertFalse(app(BillVision::class)->enabled());
    }

    public function test_google_is_sent_the_bill_and_its_answer_is_read(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($this->geminiAnswer())]);
        $settings = app(BillReaderSettings::class);
        $settings->setKey('google', 'AIza-key');
        $settings->setProvider('google');

        $out = app(BillVision::class)->read('JPEGBYTES', 'image/jpeg', 'Inventory items: none');

        $this->assertSame('Corner Shop Pvt Ltd', $out['shop']);
        $this->assertCount(2, $out['lines']);
        Http::assertSent(function (HttpRequest $r) {
            $body = $r->data();

            return str_ends_with($r->url(), '/v1beta/models/gemini-flash-latest:generateContent')
                && $r->header('x-goog-api-key') === ['AIza-key']
                && $body['contents'][0]['parts'][0]['inlineData'] === ['mimeType' => 'image/jpeg', 'data' => base64_encode('JPEGBYTES')]
                && str_contains($body['systemInstruction']['parts'][0]['text'], 'Inventory items: none')
                && $body['generationConfig']['responseMimeType'] === 'application/json'
                && $body['generationConfig']['responseSchema']['type'] === 'OBJECT'
                && $body['generationConfig']['responseSchema']['properties']['lines']['items']['properties']['quantity']['type'] === 'NUMBER';
        });
        // Google's schema takes no additionalProperties anywhere.
        $this->assertStringNotContainsString('additionalProperties', json_encode(GeminiVision::schema(BillVision::SCHEMA)));
    }

    public function test_a_refused_google_key_says_so(): void
    {
        Http::fake(['*' => Http::response(['error' => ['code' => 400, 'message' => 'API key not valid. Please pass a valid API key.']], 400)]);
        app(BillReaderSettings::class)->setKey('google', 'bad');

        $this->expectException(BillUnreadable::class);
        $this->expectExceptionMessage('The Google key was refused');
        app(BillVision::class)->read('x', 'image/jpeg', '', 'google');
    }

    public function test_the_test_button_reads_a_made_up_bill_with_the_service_asked(): void
    {
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response($this->geminiAnswer())]);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->putJson('/api/purchasing/bill-reader', ['keys' => ['google' => 'AIza-key']])->assertOk();

        $this->postJson('/api/purchasing/bill-reader/test', ['provider' => 'google'])->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('message', 'Google Gemini read the test bill: Corner Shop Pvt Ltd, 2 items, MVR 234.00.');

        // No key for Claude: the test says so instead of failing.
        $this->postJson('/api/purchasing/bill-reader/test', ['provider' => 'claude'])->assertOk()
            ->assertJsonPath('ok', false);
    }

    /** Owner, 2026-11-15: "Akuru is main company. Bake and grill is under akuru". */
    public function test_the_reader_is_told_the_business_and_its_parent_company_are_us(): void
    {
        $context = app(\App\Domains\Inventory\Bills\BillReader::class)->context();
        $this->assertStringContainsString('Our own names (the buyer on a bill, never the shop): Bake & Grill; Akuru Institute', $context);

        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->putJson('/api/purchasing/bill-reader', ['our_names' => 'Bake & Grill, Akuru Institute, Akuru Pvt Ltd'])
            ->assertOk()->assertJsonPath('our_names', 'Bake & Grill, Akuru Institute, Akuru Pvt Ltd');
        $this->assertStringContainsString('Akuru Pvt Ltd', app(\App\Domains\Inventory\Bills\BillReader::class)->context());
        // Emptied, the usual names come back.
        $this->putJson('/api/purchasing/bill-reader', ['our_names' => ''])->assertJsonPath('our_names', 'Bake & Grill, Akuru Institute');
    }

    public function test_only_someone_who_may_change_settings_reaches_the_keys(): void
    {
        Sanctum::actingAs($this->makeStaff(), ['staff']);
        $this->getJson('/api/purchasing/bill-reader')->assertForbidden();
        $this->putJson('/api/purchasing/bill-reader', ['keys' => ['claude' => 'x']])->assertForbidden();
        $this->postJson('/api/purchasing/bill-reader/test', ['provider' => 'claude'])->assertForbidden();
    }
}
