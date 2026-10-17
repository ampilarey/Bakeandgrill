<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemQuestion;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/** Questions about a dish (iruali import plan, feature 7). */
class ItemQuestionController extends Controller
{
    public const TYPE_ANSWERED = 'customer_question_answered';

    public const TYPE_NEW = 'staff_new_question';

    public const ALLERGY_LINE = 'Please tell staff about any allergy when you order.';

    /** GET /api/items/{item}/questions: answered ones, newest first. */
    public function index(Item $item): JsonResponse
    {
        $questions = ItemQuestion::query()->where('item_id', $item->id)->where('status', ItemQuestion::ANSWERED)
            ->orderByDesc('answered_at')->limit(20)->get();

        return response()->json(['questions' => $questions->map(fn (ItemQuestion $q) => $this->format($q))->values()]);
    }

    /** POST /api/items/{item}/questions: signed-in customers; waits for staff. */
    public function store(Request $request, Item $item): JsonResponse
    {
        $customer = $request->user();
        abort_unless($customer instanceof Customer, 403);
        abort_unless($item->is_active, 404);
        $validated = $request->validate(['question' => ['required', 'string', 'min:3', 'max:300']]);
        $open = ItemQuestion::query()->where('customer_id', $customer->id)->where('status', ItemQuestion::PENDING)->count();
        if ($open >= 5) {
            return response()->json(['message' => 'You have questions waiting for an answer. Please wait for those first.'], 429);
        }
        $question = ItemQuestion::query()->create([
            'item_id' => $item->id,
            'customer_id' => $customer->id,
            'question' => trim(strip_tags($validated['question'])),
            'status' => ItemQuestion::PENDING,
        ]);
        $this->tellStaff($question, $item);

        return response()->json(['question' => $this->format($question), 'message' => 'Thanks. We will answer soon.'], 201);
    }

    /** GET /api/admin/item-questions?status=pending|answered|hidden */
    public function adminIndex(Request $request): JsonResponse
    {
        $status = (string) $request->query('status', ItemQuestion::PENDING);
        $query = ItemQuestion::query()->with('item:id,name', 'customer:id,name,phone')->orderByDesc('created_at');
        if (in_array($status, [ItemQuestion::PENDING, ItemQuestion::ANSWERED, ItemQuestion::HIDDEN], true)) {
            $query->where('status', $status);
        }
        $page = $query->paginate(20);

        return response()->json([
            'data' => collect($page->items())->map(fn (ItemQuestion $q) => $this->format($q, true))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()],
            'pending' => ItemQuestion::query()->where('status', ItemQuestion::PENDING)->count(),
        ]);
    }

    /** POST /api/admin/item-questions/{id}/answer {answer, add_to_details?} */
    public function answer(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'answer' => ['required', 'string', 'max:1000'],
            'add_to_details' => ['sometimes', 'boolean'],
        ]);
        $question = ItemQuestion::query()->with('item', 'customer')->findOrFail($id);
        $first = $question->answered_at === null;
        $user = $request->user();
        $question->forceFill([
            'answer' => trim($validated['answer']),
            'answered_by' => $user instanceof User ? $user->id : null,
            'answered_at' => now(),
            'status' => ItemQuestion::ANSWERED,
        ])->save();
        // "Answer and add to the dish's details": the menu's description gains the answer.
        if ($request->boolean('add_to_details') && $question->item !== null) {
            $line = $question->answer;
            $description = trim((string) $question->item->description);
            if (!str_contains($description, $line)) {
                $question->item->forceFill(['description' => trim($description . "\n\n" . $line)])->save();
            }
        }
        if ($first) {
            $this->tellCustomer($question);
        }

        return response()->json(['question' => $this->format($question->fresh(['item', 'customer']), true)]);
    }

    /** POST /api/admin/item-questions/{id}/hide */
    public function hide(int $id): JsonResponse
    {
        $question = ItemQuestion::query()->with('item', 'customer')->findOrFail($id);
        $question->forceFill(['status' => ItemQuestion::HIDDEN])->save();

        return response()->json(['question' => $this->format($question, true)]);
    }

    private function format(ItemQuestion $q, bool $staff = false): array
    {
        $out = [
            'id' => $q->id,
            'question' => $q->question,
            'answer' => $q->status === ItemQuestion::ANSWERED || $staff ? $q->answer : null,
            'answered_at' => $q->answered_at,
            'allergy_note' => $q->answer !== null && $q->mentionsAllergens() ? self::ALLERGY_LINE : null,
            'status' => $q->status,
            'created_at' => $q->created_at,
        ];
        if ($staff) {
            $out['item'] = $q->item ? ['id' => $q->item->id, 'name' => $q->item->name] : null;
            $out['customer'] = $q->customer ? ['id' => $q->customer->id, 'name' => $q->customer->name] : null;
        }

        return $out;
    }

    private function tellStaff(ItemQuestion $question, Item $item): void
    {
        if (!AlertSwitch::isOn(self::TYPE_NEW)) {
            return;
        }
        $body = 'New question about ' . $item->name . ': "' . Str::limit($question->question, 100) . '" Answer it in Admin → Customers → Dish questions.';
        foreach (AlertAudience::addresses(self::TYPE_NEW) as $to) {
            try {
                app(SmsService::class)->send(new SmsMessage(
                    to: $to,
                    message: $body,
                    type: self::TYPE_NEW,
                    referenceType: 'item_question',
                    referenceId: (string) $question->id,
                    idempotencyKey: 'item-question:' . $question->id . ':' . substr(md5($to), 0, 10),
                ));
            } catch (\Throwable $e) {
                Log::warning('Dish question alert failed', ['question_id' => $question->id, 'error' => $e->getMessage()]);
            }
        }
    }

    private function tellCustomer(ItemQuestion $question): void
    {
        $customer = $question->customer;
        if ($customer === null || blank($customer->phone) || !AlertSwitch::isOn(self::TYPE_ANSWERED)) {
            return;
        }
        $url = rtrim((string) config('app.url'), '/') . '/menu/' . $question->item_id;
        try {
            app(SmsService::class)->send(new SmsMessage(
                to: (string) $customer->phone,
                message: 'Bake & Grill answered your question about ' . ($question->item?->name ?? 'a dish') . ": {$url}",
                type: self::TYPE_ANSWERED,
                customerId: $customer->id,
                referenceType: 'item_question',
                referenceId: (string) $question->id,
                idempotencyKey: 'item-question-answer:' . $question->id,
            ));
        } catch (\Throwable $e) {
            Log::warning('Dish question answer could not be sent', ['question_id' => $question->id, 'error' => $e->getMessage()]);
        }
    }
}
