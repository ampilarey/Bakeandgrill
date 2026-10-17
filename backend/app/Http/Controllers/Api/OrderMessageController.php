<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Complaints\Services\ComplaintService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertAudience;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Reviews\ReviewPhotos;
use App\Http\Controllers\Controller;
use App\Models\Complaint;
use App\Models\Order;
use App\Models\OrderMessage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * "Message us" about an order (iruali import plan, feature 9): "please add
 * extra sauce", "I'm running 10 minutes late". The customer writes from the
 * order page (its tracking token is the key, so guests can too) while the
 * order is open and for two days after it is completed; staff answer from the
 * order in Admin. Photos are private, through a signed link that lasts 30
 * minutes. Complaints stay separate: staff can turn a message into one.
 */
class OrderMessageController extends Controller
{
    public const TYPE_STAFF = 'staff_order_message';

    public const TYPE_REPLY = 'customer_order_message_reply';

    public const OPEN_DAYS_AFTER = 2;

    public function __construct(private readonly ReviewPhotos $photos) {}

    // ── Customer, by tracking token ───────────────────────────────────────────

    /** GET /api/orders/track/{token}/messages */
    public function index(string $token): JsonResponse
    {
        $order = $this->orderByToken($token);
        OrderMessage::query()->where('order_id', $order->id)->where('sender', OrderMessage::STAFF)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json([
            'messages' => $this->thread($order),
            'can_write' => self::canWrite($order),
        ]);
    }

    /** POST /api/orders/track/{token}/messages {body, photo?} */
    public function store(Request $request, string $token): JsonResponse
    {
        $order = $this->orderByToken($token);
        if (!self::canWrite($order)) {
            return response()->json(['message' => 'This order is closed for messages. For a problem with it, use Report a problem.'], 422);
        }
        $validated = $request->validate([
            'body' => ['required', 'string', 'max:1000'],
            'photo' => ['nullable', 'file', 'image', 'max:5120'],
        ]);
        $photo = $request->file('photo') ? $this->photos->store($request->file('photo'), 'order-message-photos')['path'] : null;
        $message = OrderMessage::query()->create([
            'order_id' => $order->id,
            'sender' => OrderMessage::CUSTOMER,
            'body' => trim(strip_tags($validated['body'])),
            'photo_path' => $photo,
        ]);
        $this->tellStaff($order, $message);

        return response()->json(['message' => $this->format($message)], 201);
    }

    /** GET /api/order-messages/{id}/photo (signed, 30 minutes) */
    public function photo(int $id): Response
    {
        $message = OrderMessage::query()->findOrFail($id);
        abort_unless(is_string($message->photo_path) && $message->photo_path !== '', 404);

        return $this->photos->stream($message->photo_path, false);
    }

    // ── Staff ─────────────────────────────────────────────────────────────────

    /** GET /api/admin/order-messages: orders whose newest message is the customer's, waiting for a reply. */
    public function unanswered(): JsonResponse
    {
        $latest = OrderMessage::query()->selectRaw('MAX(id) as id')->groupBy('order_id');
        $rows = OrderMessage::query()->whereIn('id', $latest)->where('sender', OrderMessage::CUSTOMER)
            ->with('order:id,order_number,type,status,customer_id', 'order.customer:id,name,phone')
            ->orderByDesc('created_at')->limit(50)->get();

        return response()->json(['data' => $rows->map(fn (OrderMessage $m) => [
            'order' => ['id' => $m->order_id, 'order_number' => $m->order?->order_number, 'status' => $m->order?->status, 'customer' => $m->order?->customer?->name],
            'message' => $this->format($m),
        ])->values()]);
    }

    /** GET /api/admin/orders/{id}/messages: the thread; the customer's messages count as read. */
    public function adminThread(int $id): JsonResponse
    {
        $order = Order::query()->findOrFail($id);
        OrderMessage::query()->where('order_id', $order->id)->where('sender', OrderMessage::CUSTOMER)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['messages' => $this->thread($order, true)]);
    }

    /** POST /api/admin/orders/{id}/messages {body}: the customer is told by SMS or email with a link back. */
    public function reply(Request $request, int $id): JsonResponse
    {
        $order = Order::query()->with('customer')->findOrFail($id);
        $validated = $request->validate(['body' => ['required', 'string', 'max:1000']]);
        $user = $request->user();
        $message = OrderMessage::query()->create([
            'order_id' => $order->id,
            'sender' => OrderMessage::STAFF,
            'user_id' => $user instanceof User ? $user->id : null,
            'body' => trim($validated['body']),
        ]);
        OrderMessage::query()->where('order_id', $order->id)->where('sender', OrderMessage::CUSTOMER)->whereNull('read_at')->update(['read_at' => now()]);
        $this->tellCustomer($order, $message);

        return response()->json(['message' => $this->format($message, true)], 201);
    }

    /** POST /api/admin/order-messages/{id}/complaint: "Turn into a complaint" with the text and photo. */
    public function toComplaint(int $id, ComplaintService $complaints): JsonResponse
    {
        $message = OrderMessage::query()->with('order')->findOrFail($id);
        abort_unless($message->sender === OrderMessage::CUSTOMER, 422, 'Only a customer message can become a complaint.');
        if ($message->complaint_id !== null) {
            return response()->json(['complaint_id' => $message->complaint_id]);
        }
        $complaint = DB::transaction(function () use ($message, $complaints) {
            $complaint = $complaints->create([
                'order' => $message->order,
                'source' => 'order_message',
                'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
                'comment' => $message->body,
                'photo_disk' => $message->photo_path ? ReviewPhotos::DISK : null,
                'photo_path' => $message->photo_path,
                'idempotency_key' => 'order-message:' . $message->id,
            ]);
            $message->forceFill(['complaint_id' => $complaint->id])->save();

            return $complaint;
        });

        return response()->json(['complaint_id' => $complaint->id, 'reference' => $complaint->reference_number], 201);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Open while the order is, and for two days after it is completed; never once cancelled. */
    public static function canWrite(Order $order): bool
    {
        if ($order->status === 'cancelled' || $order->cancelled_at !== null) {
            return false;
        }
        $done = $order->completed_at;

        return $done === null || $done->gt(now()->subDays(self::OPEN_DAYS_AFTER));
    }

    /** Customer messages staff have not read, per order (the till's badge). */
    public static function unreadFor(array $orderIds): array
    {
        if ($orderIds === []) {
            return [];
        }

        return OrderMessage::query()->whereIn('order_id', $orderIds)->where('sender', OrderMessage::CUSTOMER)->whereNull('read_at')
            ->orderBy('id')->get(['order_id', 'body'])->groupBy('order_id')
            ->map(fn ($rows) => ['count' => $rows->count(), 'latest' => Str::limit((string) $rows->last()->body, 80)])->all();
    }

    private function orderByToken(string $token): Order
    {
        abort_unless(preg_match('/^[A-Za-z0-9]{16,64}$/', $token) === 1, 404);

        return Order::query()->where('tracking_token', $token)->firstOrFail();
    }

    /** @return list<array<string, mixed>> */
    private function thread(Order $order, bool $staff = false): array
    {
        return OrderMessage::query()->where('order_id', $order->id)->with('user:id,name')->orderBy('id')->limit(200)->get()
            ->map(fn (OrderMessage $m) => $this->format($m, $staff))->values()->all();
    }

    private function format(OrderMessage $m, bool $staff = false): array
    {
        return [
            'id' => $m->id,
            'from' => $m->sender,
            'body' => $m->body,
            'photo_url' => $m->photo_path ? URL::temporarySignedRoute('order-messages.photo', now()->addMinutes(30), ['id' => $m->id]) : null,
            'read' => $m->read_at !== null,
            'created_at' => $m->created_at,
            'staff_name' => $staff && $m->sender === OrderMessage::STAFF ? $m->user?->name : null,
            'complaint_id' => $staff ? $m->complaint_id : null,
        ];
    }

    private function tellStaff(Order $order, OrderMessage $message): void
    {
        if (!AlertSwitch::isOn(self::TYPE_STAFF)) {
            return;
        }
        $body = "Order {$order->order_number}, customer: \"" . Str::limit($message->body, 120) . '" Reply from the order in Admin.';
        foreach (AlertAudience::addresses(self::TYPE_STAFF) as $to) {
            try {
                app(SmsService::class)->send(new SmsMessage(
                    to: $to,
                    message: $body,
                    type: self::TYPE_STAFF,
                    referenceType: 'order_message',
                    referenceId: (string) $message->id,
                    idempotencyKey: 'order-message:' . $message->id . ':' . substr(md5($to), 0, 10),
                ));
            } catch (\Throwable $e) {
                Log::warning('Order message alert failed', ['message_id' => $message->id, 'error' => $e->getMessage()]);
            }
        }
    }

    private function tellCustomer(Order $order, OrderMessage $message): void
    {
        $customer = $order->customer;
        if ($customer === null || blank($customer->phone) || !AlertSwitch::isOn(self::TYPE_REPLY)) {
            return;
        }
        $url = rtrim((string) config('app.url'), '/') . '/order/track/' . $order->tracking_token;
        try {
            app(SmsService::class)->send(new SmsMessage(
                to: (string) $customer->phone,
                message: "Bake & Grill about order {$order->order_number}: " . Str::limit($message->body, 100) . " Reply: {$url}",
                type: self::TYPE_REPLY,
                customerId: $customer->id,
                referenceType: 'order_message',
                referenceId: (string) $message->id,
                idempotencyKey: 'order-message-reply:' . $message->id,
            ));
        } catch (\Throwable $e) {
            Log::warning('Order message reply could not be sent', ['message_id' => $message->id, 'error' => $e->getMessage()]);
        }
    }
}
