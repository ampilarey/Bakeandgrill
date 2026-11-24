<?php

declare(strict_types=1);

namespace Tests\Feature\Ai;

use App\Domains\Ai\AiFeatures;
use App\Domains\Ai\AiTasks;
use App\Domains\Ai\Assistant;
use App\Domains\Ai\AssistantUnavailable;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\ItemQuestion;
use App\Models\NewsletterIssue;
use App\Models\Review;
use App\Models\Role;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Owner, 2026-11-24: "Build all. But add admin settings to on/off." The assistant's
 * eight jobs, each behind its switch; every answer is a draft and nothing is saved.
 */
class AssistantFeaturesTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<array{instructions: string, prompt: string, file: ?array}> */
    public static array $asked = [];

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        self::$asked = [];
    }

    /** An assistant that answers with these, in turn, instead of calling Claude. */
    private function assistant(array $answers, bool $ready = true): void
    {
        self::$asked = [];
        $this->app->instance(Assistant::class, new class($answers, $ready) extends Assistant
        {
            public function __construct(private array $answers, private bool $on) {}

            public function ready(): bool
            {
                return $this->on;
            }

            public function ask(string $instructions, string $prompt, array $schema, ?array $file = null, int $timeout = 60, int $maxTokens = 4000): array
            {
                AssistantFeaturesTest::$asked[] = ['instructions' => $instructions, 'prompt' => $prompt, 'file' => $file];
                $next = array_shift($this->answers);
                if ($next instanceof AssistantUnavailable) {
                    throw $next;
                }

                return (array) $next;
            }
        });
    }

    public function test_every_feature_has_a_switch_and_a_master_and_all_start_on(): void
    {
        $this->assistant([]);
        $card = $this->getJson('/api/admin/ai/settings')->assertOk()->json();
        $this->assertTrue($card['ready']);
        $this->assertTrue($card['enabled']);
        $this->assertSame(array_keys(AiFeatures::FEATURES), array_column($card['features'], 'key'));
        $this->assertNotContains(false, array_column($card['features'], 'on'));

        // One feature off: its button goes, the rest stay.
        $this->putJson('/api/admin/ai/settings', ['features' => ['captions' => false]])->assertOk();
        $status = $this->getJson('/api/admin/ai/status')->assertOk()->json();
        $this->assertFalse($status['features']['captions']);
        $this->assertTrue($status['features']['dhivehi']);
        $this->postJson('/api/admin/ai/caption', ['headline' => 'Chicken Momo'])->assertStatus(422)->assertJsonPath('message', 'This assistant feature is switched off (System → Integrations → Assistant).');
        $this->assertSame([], self::$asked, 'a switched-off feature never calls the assistant');

        // The master off: nothing works, and each switch is kept as it was set.
        $this->putJson('/api/admin/ai/settings', ['enabled' => false])->assertOk()->assertJsonPath('enabled', false);
        $status = $this->getJson('/api/admin/ai/status')->json();
        $this->assertNotContains(true, $status['features']);
        $this->postJson('/api/admin/ai/dhivehi', ['text' => 'Hello'])->assertStatus(422);
        $back = $this->putJson('/api/admin/ai/settings', ['enabled' => true])->json();
        $this->assertSame(['captions'], array_values(array_map(fn ($f) => $f['key'], array_filter($back['features'], fn ($f) => !$f['on']))));
    }

    public function test_without_a_key_nothing_is_offered_and_a_call_says_where_to_add_one(): void
    {
        $this->assistant([], ready: false);
        $status = $this->getJson('/api/admin/ai/status')->json();
        $this->assertFalse($status['ready']);
        $this->assertNotContains(true, $status['features']);
        $this->postJson('/api/admin/ai/dhivehi', ['text' => 'Hello'])->assertStatus(422)
            ->assertJsonPath('message', 'The assistant is not set up yet: add a key under System → Integrations → API keys.');
    }

    public function test_only_someone_who_may_change_settings_sets_the_switches(): void
    {
        $this->assistant([]);
        $role = Role::query()->firstOrCreate(['slug' => 'staff'], ['name' => 'Staff']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['staff']);
        $this->putJson('/api/admin/ai/settings', ['enabled' => false])->assertForbidden();
        $this->getJson('/api/admin/ai/status')->assertOk();
    }

    public function test_a_reply_is_drafted_from_what_the_customer_wrote_and_nothing_is_saved(): void
    {
        $this->assistant([['reply' => 'Thank you, we are glad you liked it.'], ['reply' => 'It is mild. Please tell staff about any allergy when you order.']]);
        $item = Item::factory()->create(['name' => 'Chicken Momo', 'description' => 'Steamed dumplings', 'base_price' => 45]);
        $review = Review::query()->create(['item_id' => $item->id, 'rating' => 5, 'comment' => 'Best momo in Male', 'type' => 'item', 'status' => 'approved']);

        $this->postJson("/api/admin/ai/draft-reply/review/{$review->id}")->assertOk()->assertJsonPath('text', 'Thank you, we are glad you liked it.');
        $this->assertStringContainsString('Best momo in Male', self::$asked[0]['prompt']);
        $this->assertStringContainsString('Never promise a refund', self::$asked[0]['instructions']);
        $this->assertNull($review->fresh()->reply, 'a draft is not a reply');

        $q = ItemQuestion::query()->create(['item_id' => $item->id, 'question' => 'Is it spicy?', 'status' => 'pending']);
        $this->postJson("/api/admin/ai/draft-reply/question/{$q->id}")->assertOk()->assertJsonPath('text', 'It is mild. Please tell staff about any allergy when you order.');
        $this->assertStringContainsString('Steamed dumplings', self::$asked[1]['prompt']);
        $this->assertNull($q->fresh()->answer);
    }

    public function test_dhivehi_glossary_and_nutrition_come_back_as_suggestions(): void
    {
        $this->assistant([['dv' => 'ކުކުޅު މޯމޯ']]);
        $this->postJson('/api/admin/ai/dhivehi', ['text' => 'Chicken Momo', 'kind' => 'name'])->assertOk()->assertJsonPath('dv', 'ކުކުޅު މޯމޯ');
        $this->assertStringContainsString('name only', self::$asked[0]['instructions']);

        // The glossary keeps only words it was asked about, and only ones with an answer.
        $this->assistant([['words' => [['en' => 'onion', 'dv' => 'ފިޔާ', 'sure' => true], ['en' => 'cumin', 'dv' => '', 'sure' => false], ['en' => 'not asked', 'dv' => 'x', 'sure' => true]]]]);
        $this->assertSame(['onion' => ['dv' => 'ފިޔާ', 'sure' => true]], app(AiTasks::class)->glossary(['onion', 'cumin']));

        // Nutrition: an unknown ingredient is left out, a wild figure is held to what a food can be.
        $flour = InventoryItem::create(['name' => 'Flour', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $masala = InventoryItem::create(['name' => 'House masala', 'unit' => 'kg', 'unit_cost' => 10, 'is_active' => true]);
        $zero = ['kcal' => 0, 'fat' => 0, 'sat_fat' => 0, 'carbs' => 0, 'sugars' => 0, 'protein' => 0, 'salt' => 0];
        $this->assistant([['items' => [
            ['id' => $flour->id, 'known' => true, 'kcal' => 364, 'fat' => 1, 'sat_fat' => 0.2, 'carbs' => 760, 'sugars' => 0.3, 'protein' => 10.3, 'salt' => 0.01],
            ['id' => $masala->id, 'known' => false] + $zero,
        ]]]);
        $rows = $this->postJson('/api/admin/ai/nutrition', ['ids' => [$flour->id, $masala->id]])->assertOk()->json('items');
        $this->assertCount(1, $rows);
        $this->assertSame($flour->id, $rows[0]['id']);
        $this->assertEquals(364, $rows[0]['nutrition']['kcal']);
        $this->assertEquals(100, $rows[0]['nutrition']['carbs']);
        $this->assertNull($flour->fresh()->nutrition, 'nothing is saved until the person saves it');
    }

    public function test_a_caption_and_a_newsletter_draft(): void
    {
        $this->assistant([['en' => 'Hot momo today.', 'dv' => 'މިއަދު ހޫނު މޯމޯ.']]);
        $this->postJson('/api/admin/ai/caption', ['price' => 'MVR 45.00'])->assertStatus(422);
        $this->postJson('/api/admin/ai/caption', ['headline' => 'Chicken Momo', 'price' => 'MVR 45.00', 'link' => 'https://bakeandgrill.mv/order'])
            ->assertOk()->assertJsonPath('en', 'Hot momo today.')->assertJsonPath('dv', 'މިއަދު ހޫނު މޯމޯ.');
        $this->assertStringContainsString('MVR 45.00', self::$asked[0]['prompt']);

        $this->assistant([['subject_en' => 'New this week', 'subject_dv' => 'މި ހަފްތާގައި', 'body_en' => 'We have new dishes.', 'body_dv' => 'އާ ކެއުންތައް.']]);
        Item::factory()->create(['name' => 'Jhol Momo', 'base_price' => 55, 'is_active' => true]);
        $this->postJson('/api/admin/ai/newsletter', ['hint' => 'Mention Friday brunch', 'sections' => ['new' => true, 'new_days' => 14]])->assertOk()->assertJsonPath('subject_en', 'New this week')->assertJsonPath('body_dv', 'އާ ކެއުންތައް.');
        $this->assertStringContainsString('Friday brunch', self::$asked[0]['prompt']);
        $this->assertStringContainsString('Jhol Momo', self::$asked[0]['prompt'], 'what is ticked on the screen is what the draft may talk about');
        $this->assertSame(0, NewsletterIssue::query()->count(), 'nothing is saved');
    }

    public function test_a_scanned_po_is_read_into_the_invoice_forms_draft(): void
    {
        $answer = [
            'is_po' => true, 'po_number' => 'PO-7781', 'order_date' => '2026-11-20', 'delivery_date' => 'next week', 'bill_to' => 'Coral Resort', 'bill_address' => 'K. Atoll',
            'bill_tin' => '1234567GST501', 'bill_email' => '', 'deliver_to' => 'Jetty 3', 'payment_term' => '30 days', 'currency' => '', 'subtotal' => 900, 'tax' => 0, 'total' => 900,
            'lines' => [['description' => 'Chicken Momo', 'quantity' => 20, 'unit' => 'pkt', 'unit_price' => 45, 'amount' => 900], ['description' => ' ', 'quantity' => 0, 'unit' => '', 'unit_price' => 0, 'amount' => 0]],
        ];
        $this->assistant([$answer]);
        $draft = $this->post('/api/admin/ai/po-read', ['file' => UploadedFile::fake()->image('po.jpg')], ['Accept' => 'application/json'])->assertOk()->json('draft');
        $this->assertSame('PO-7781', $draft['po_number']);
        $this->assertSame('', $draft['delivery_date'], 'a date that is not a date is left blank');
        $this->assertSame('MVR', $draft['currency']);
        $this->assertCount(1, $draft['lines']);
        $this->assertNull($draft['tax']);
        $this->assertSame('image/jpeg', self::$asked[0]['file']['mime']);

        $this->assistant([['is_po' => false] + $answer]);
        $this->post('/api/admin/ai/po-read', ['file' => UploadedFile::fake()->image('cat.jpg')], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_a_question_is_answered_from_the_reports_for_the_dates_it_names(): void
    {
        $this->assistant([['about' => true, 'from' => '2026-11-10', 'to' => '2099-01-01'], ['answer' => 'You sold 12 momo.']]);
        $this->assertSame('You sold 12 momo.', app(AiTasks::class)->answer('How many momo last week?', CarbonImmutable::parse('2026-11-24')));
        $figures = json_decode(self::$asked[1]['prompt'], true)['figures'];
        $this->assertSame(['from' => '2026-11-10', 'to' => '2026-11-24', 'days' => 15], $figures['period'], 'never past today');
        $this->assertArrayHasKey('items_sold', $figures);

        $this->assistant([['about' => false, 'from' => '', 'to' => '']]);
        $this->assertStringContainsString('I can answer questions about sales', app(AiTasks::class)->answer('What is the weather?', CarbonImmutable::parse('2026-11-24')));
        $this->assertCount(1, self::$asked, 'no report is run for a question that is not about sales');
    }
}
