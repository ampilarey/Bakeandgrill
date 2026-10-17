<?php

declare(strict_types=1);

namespace Tests\Feature\Menu;

use App\Domains\Permissions\PermissionCatalogSync;
use App\Http\Controllers\Api\ItemQuestionController;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemQuestion;
use App\Models\SmsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Questions about a dish (iruali import plan, feature 7). */
class ItemQuestionsTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();
        PermissionCatalogSync::sync();
        $this->customer = Customer::factory()->create(['phone' => '+9607773333']);
        $this->item = Item::factory()->create(['name' => 'Garudhiya', 'is_active' => true, 'description' => 'Tuna broth.']);
    }

    public function test_a_question_waits_for_staff_then_shows_with_its_answer(): void
    {
        $this->getJson("/api/items/{$this->item->id}/questions")->assertOk()->assertJsonCount(0, 'questions');
        $this->postJson("/api/items/{$this->item->id}/questions", ['question' => 'Is it spicy?'])->assertUnauthorized();

        Sanctum::actingAs($this->customer, ['customer']);
        $id = $this->postJson("/api/items/{$this->item->id}/questions", ['question' => 'Is it spicy?'])
            ->assertCreated()->json('question.id');
        $this->postJson("/api/items/{$this->item->id}/questions", ['question' => str_repeat('x', 301)])->assertUnprocessable();
        $this->getJson("/api/items/{$this->item->id}/questions")->assertJsonCount(0, 'questions');

        $owner = $this->makeOwner();
        Sanctum::actingAs($owner, ['staff']);
        $this->getJson('/api/admin/item-questions')->assertOk()->assertJsonPath('pending', 1)->assertJsonPath('data.0.item.name', 'Garudhiya');
        $this->postJson("/api/admin/item-questions/{$id}/answer", ['answer' => 'Not spicy. Chilli comes on the side.', 'add_to_details' => true])->assertOk();
        $this->postJson("/api/admin/item-questions/{$id}/answer", ['answer' => 'Not spicy at all. Chilli comes on the side.'])->assertOk();

        $this->getJson("/api/items/{$this->item->id}/questions")->assertJsonPath('questions.0.answer', 'Not spicy at all. Chilli comes on the side.')
            ->assertJsonPath('questions.0.allergy_note', null);
        $this->assertStringContainsString('Chilli comes on the side.', (string) $this->item->fresh()->description);
        $this->assertSame(1, SmsLog::query()->where('type', ItemQuestionController::TYPE_ANSWERED)->count(), 'told once');
    }

    public function test_an_answer_about_allergens_carries_the_standard_line_and_hidden_ones_do_not_show(): void
    {
        $q = ItemQuestion::create(['item_id' => $this->item->id, 'customer_id' => $this->customer->id, 'question' => 'Does it have nuts?', 'status' => 'pending']);
        $hidden = ItemQuestion::create(['item_id' => $this->item->id, 'question' => 'Rude', 'status' => 'pending']);
        Sanctum::actingAs($this->makeOwner(), ['staff']);
        $this->postJson("/api/admin/item-questions/{$q->id}/answer", ['answer' => 'No nuts are used.'])->assertOk();
        $this->postJson("/api/admin/item-questions/{$hidden->id}/hide")->assertOk();

        $this->getJson("/api/items/{$this->item->id}/questions")->assertJsonCount(1, 'questions')
            ->assertJsonPath('questions.0.allergy_note', ItemQuestionController::ALLERGY_LINE);
    }

    public function test_staff_with_customers_manage_hear_about_a_new_question(): void
    {
        $owner = $this->makeOwner();
        $owner->forceFill(['phone' => '+9607779999'])->save();
        Sanctum::actingAs($this->customer, ['customer']);
        $this->postJson("/api/items/{$this->item->id}/questions", ['question' => 'Is it halal?'])->assertCreated();

        $this->assertSame(1, SmsLog::query()->where('type', ItemQuestionController::TYPE_NEW)->count());
    }

    public function test_the_dish_page_lists_answered_questions_and_offers_to_ask(): void
    {
        ItemQuestion::create(['item_id' => $this->item->id, 'question' => 'Is there egg?', 'answer' => 'No egg.', 'status' => 'answered', 'answered_at' => now()]);
        ItemQuestion::create(['item_id' => $this->item->id, 'question' => 'Waiting one', 'status' => 'pending']);

        $this->get('/menu/' . $this->item->id)->assertOk()
            ->assertSee('Is there egg?')->assertSee('No egg.')
            ->assertSee(ItemQuestionController::ALLERGY_LINE)
            ->assertDontSee('Waiting one')
            ->assertSee('data-testid="item-ask-link"', false);
    }
}
