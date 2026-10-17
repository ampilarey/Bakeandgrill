<?php

declare(strict_types=1);

namespace Tests\Feature\Posters;

use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Mail\PosterShopMail;
use App\Models\Expense;
use App\Models\Item;
use App\Models\PosterOrder;
use App\Models\SiteSetting;
use App\Models\SmsLog;
use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class PosterShopTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_print_shop_is_not_listed_with_food_suppliers_and_a_clear_poster_is_emailed(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        Supplier::query()->create(['name' => 'Rice trader', 'kind' => 'supplier', 'is_active' => true]);

        $shop = $this->postJson('/api/posters/shops', [
            'name' => 'Island Press',
            'email' => 'press@example.test',
            'print_prefs' => ['layers' => 'spots', 'white_name' => 'White', 'gloss_name' => 'Spot UV'],
        ])->assertCreated();
        $this->assertSame('spots', $shop->json('print_prefs.layers'));

        $names = collect($this->getJson('/api/suppliers')->json('suppliers.data'))->pluck('name');
        $this->assertTrue($names->contains('Rice trader'));
        $this->assertFalse($names->contains('Island Press'));

        $poster = $this->postJson('/api/posters', $this->clear())->assertCreated();
        $order = $this->postJson('/api/posters/' . $poster->json('id') . '/orders', [
            'supplier_id' => $shop->json('id'),
            'material' => 'clear',
            'white' => 'under all printed areas',
            'gloss' => 'logo and price',
            'masks' => true,
            'sizes' => ['A5'],
        ])->assertCreated();
        $this->assertSame('sent', $order->json('state'));
        Mail::assertSent(PosterShopMail::class);
        $pdf = $this->printPdf(PosterOrder::query()->findOrFail($order->json('id')));
        $this->assertStringContainsString('White', $pdf);
        $this->assertStringContainsString('Spot#20UV', $pdf);

        $this->postJson('/api/posters/orders/' . $order->json('id') . '/quote', ['quote_mvr' => 250])->assertOk();
        $this->postJson('/api/posters/orders/' . $order->json('id') . '/approve-quote')->assertOk()
            ->assertJsonPath('state', 'quote_approved');
        $expense = Expense::query()->where('supplier_id', $shop->json('id'))->first();
        $this->assertNotNull($expense);
        $this->assertSame(25000, (int) $expense->amount_laar);
    }

    public function test_proof_approval_holds_the_email_until_the_signed_link_is_used(): void
    {
        Mail::fake();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        SiteSetting::set('poster_proof_approval', 'true');
        AlertSwitch::setAll('owner_poster_proof', false);
        $shop = $this->postJson('/api/posters/shops', [
            'name' => 'Island Press',
            'email' => 'press@example.test',
        ])->assertCreated();
        $poster = $this->postJson('/api/posters', $this->clear())->assertCreated();
        $order = $this->postJson('/api/posters/' . $poster->json('id') . '/orders', [
            'supplier_id' => $shop->json('id'),
            'material' => 'clear',
            'white' => 'under all printed areas',
            'sizes' => ['A5'],
        ])->assertCreated();
        $this->assertSame('draft', $order->json('state'));
        Mail::assertNothingSent();

        $page = $this->get($order->json('proof_url'))->assertOk()->assertSee('Approve and send');
        preg_match('/name="_token" value="([^"]+)"/', (string) $page->getContent(), $token);
        $this->post($this->approveUrl((int) $order->json('id')), ['_token' => $token[1] ?? ''])->assertOk()->assertSee('sent');
        Mail::assertSent(PosterShopMail::class);
        $this->assertSame('sent', PosterOrder::query()->find($order->json('id'))->state);
    }

    public function test_a_price_change_marks_the_poster_and_the_take_down_alert_fires_once(): void
    {
        Sanctum::actingAs($this->makeOwner(['phone' => '7771001']), ['staff']);
        AlertAudience::save('owner_poster_stale', ['phones' => ['7771001']]);
        AlertAudience::save('owner_poster_ending', ['phones' => ['7771002']]);
        AlertSwitch::setAll('owner_poster_stale', true);
        AlertSwitch::setAll('owner_poster_ending', true);

        $item = Item::factory()->create(['name' => 'Iced coffee', 'base_price' => 45, 'is_active' => true]);
        $poster = $this->postJson('/api/posters', [
            'name' => 'Iced coffee',
            'template_key' => 'price_drop',
            'layout' => 'compare',
            'mood' => 'cream',
            'language' => 'en',
            'sizes' => ['A5'],
            'slots' => ['headline' => 'New lower price', 'price' => ''],
            'bindings' => ['item_id' => $item->id],
            'take_down_on' => now()->addDay()->toDateString(),
        ])->assertCreated();
        $this->postJson('/api/posters/' . $poster->json('id') . '/export', [
            'sizes' => ['A5'],
            'material' => 'foam',
        ])->assertStatus(202);

        $item->update(['base_price' => 50]);
        $listed = $this->getJson('/api/posters')->json('posters.0');
        $this->assertTrue($listed['stale']);
        $this->assertStringContainsString('MVR 45.00', $listed['diff']);
        $this->assertStringContainsString('MVR 50.00', $listed['diff']);

        $this->artisan('posters:alert')->assertSuccessful();
        $this->assertSame(1, SmsLog::query()->where('type', 'owner_poster_stale')->count());
        $this->assertSame(1, SmsLog::query()->where('type', 'owner_poster_ending')->count());
        $this->artisan('posters:alert')->assertSuccessful();
        $this->assertSame(1, SmsLog::query()->where('type', 'owner_poster_stale')->count());
    }

    public function test_spot_layers_without_a_name_are_blocked_and_the_complaint_poster_is_made_on_its_own_page(): void
    {
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $preview = $this->postJson('/api/posters/preview', [
            'template_key' => 'scan_to_order',
            'layout' => 'qr_card',
            'mood' => 'dark',
            'language' => 'en',
            'landscape' => true,
            'sizes' => ['A5'],
            'slots' => ['headline' => 'Tell us how we did'],
            'layers' => 'spots',
            'white_name' => '',
            'gloss' => 'logo and price',
            'gloss_name' => '',
            'material' => 'clear',
            'white' => 'under all printed areas',
        ])->assertOk();
        $ids = collect($preview->json('preflight'))->where('level', 'red')->pluck('id');
        $this->assertTrue($ids->contains('spots'));
        // "Tell us how we did" opens the existing complaint poster; it is never made here.
        $this->postJson('/api/posters', ['template_key' => 'how_we_did', 'layout' => 'qr_card', 'sizes' => ['A5']])
            ->assertStatus(422)->assertJsonPath('message', 'This poster is made on its own page: /complain/poster/sheet');
        $this->get('/complain/poster/sheet')->assertOk();
    }

    /** @return array<string, mixed> */
    private function clear(): array
    {
        return [
            'name' => 'Window sign',
            'template_key' => 'plain_notice',
            'layout' => 'notice',
            'mood' => 'dark',
            'language' => 'en',
            'sizes' => ['A5'],
            'slots' => ['headline' => 'Open', 'body' => 'Come in'],
            'bindings' => [],
        ];
    }

    private function printPdf(PosterOrder $order): string
    {
        $path = (string) $order->export?->zip_path;
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($path) === true);
        $pdf = '';
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            if (str_ends_with($name, '.pdf') && !str_contains($name, 'SPEC') && !str_contains($name, 'WHITE')) {
                $pdf .= (string) $zip->getFromIndex($i);
            }
        }
        $zip->close();

        return $pdf;
    }

    private function approveUrl(int $orderId): string
    {
        return \Illuminate\Support\Facades\URL::temporarySignedRoute('posters.proof.approve', now()->addDay(), ['order' => $orderId]);
    }
}
