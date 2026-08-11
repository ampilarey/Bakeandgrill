<?php

declare(strict_types=1);

namespace App\Domains\Complaints\Services;

use App\Models\Complaint;
use App\Models\ComplaintContactLog;
use App\Models\ComplaintItem;
use App\Models\ComplaintStatusHistory;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Receipt;
use App\Models\ReceiptFeedback;
use App\Models\Refund;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ComplaintService
{
    public function __construct(
        private readonly ComplaintNotificationService $notifications,
    ) {}

    /**
     * @param  array{
     *   receipt?: ?Receipt,
     *   invoice?: ?Invoice,
     *   order?: ?Order,
     *   source?: string,
     *   categories?: list<string>,
     *   category?: string,
     *   comment?: ?string,
     *   photo_disk?: ?string,
     *   photo_path?: ?string,
     *   photo_upload_id?: ?string,
     *   idempotency_key?: ?string,
     *   receipt_feedback_id?: ?int,
     *   items?: list<array{order_item_id?: int|null, item_name: string, quantity?: float|int, unit_price_laar?: int, line_total_laar?: int}>
     * }  $data
     */
    public function create(array $data): Complaint
    {
        if (! empty($data['idempotency_key'])) {
            $existing = Complaint::query()->where('idempotency_key', $data['idempotency_key'])->first();
            if ($existing) {
                return $existing;
            }
        }

        $receipt = $data['receipt'] ?? null;
        $invoice = $data['invoice'] ?? null;
        $order = $data['order'] ?? $receipt?->order ?? $invoice?->order;
        if ($order && ! $order->relationLoaded('customer')) {
            $order->loadMissing('customer');
        }

        $categories = $this->normalizeCategories($data);
        $isFoodSafety = Complaint::categoriesIncludeFoodSafety($categories);
        $needsRefund = Complaint::categoriesIncludeBilling($categories);

        [$photoDisk, $photoPath] = $this->resolvePhoto($data);

        $complaint = DB::transaction(function () use ($data, $receipt, $invoice, $order, $categories, $isFoodSafety, $needsRefund, $photoDisk, $photoPath) {
            $complaint = Complaint::create([
                'reference_number' => 'PENDING',
                'receipt_id' => $receipt?->id,
                'invoice_id' => $invoice?->id,
                'order_id' => $order?->id,
                'customer_id' => $order?->customer_id,
                'receipt_feedback_id' => $data['receipt_feedback_id'] ?? null,
                'source' => $data['source'] ?? ($invoice ? 'invoice' : 'receipt'),
                'categories' => $categories,
                'comment' => $data['comment'] ?? null,
                'photo_disk' => $photoDisk,
                'photo_path' => $photoPath,
                'status' => Complaint::STATUS_NEW,
                'needs_refund_review' => $needsRefund,
                'is_food_safety' => $isFoodSafety,
                'shift_id' => $order?->shift_id,
                'cashier_user_id' => $order?->user_id,
                'owner_alert_status' => Complaint::OWNER_ALERT_PENDING,
                'idempotency_key' => $data['idempotency_key'] ?? null,
            ]);

            $complaint->reference_number = 'C-'.$complaint->id;
            $complaint->save();

            foreach ($data['items'] ?? [] as $row) {
                ComplaintItem::create([
                    'complaint_id' => $complaint->id,
                    'order_item_id' => $row['order_item_id'] ?? null,
                    'item_name' => $row['item_name'],
                    'quantity' => $row['quantity'] ?? 1,
                    'unit_price_laar' => $row['unit_price_laar'] ?? 0,
                    'line_total_laar' => $row['line_total_laar'] ?? 0,
                ]);
            }

            ComplaintStatusHistory::create([
                'complaint_id' => $complaint->id,
                'from_status' => null,
                'to_status' => Complaint::STATUS_NEW,
                'changed_by_user_id' => null,
                'internal_note' => 'Complaint recorded',
            ]);

            return $complaint;
        });

        // Notification is a consequence — never block the save.
        try {
            $this->notifications->notifyOpened($complaint->fresh(['order.customer', 'customer']));
        } catch (\Throwable) {
            $complaint->update([
                'owner_alert_status' => Complaint::OWNER_ALERT_FAILED,
                'owner_alert_detail' => 'Notification path threw; complaint retained.',
            ]);
        }

        return $complaint->fresh(['items', 'order', 'customer']);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return list<string>
     */
    private function normalizeCategories(array $data): array
    {
        $raw = $data['categories'] ?? null;
        if ($raw === null && isset($data['category'])) {
            $raw = [$data['category']];
        }
        if (! is_array($raw)) {
            throw ValidationException::withMessages([
                'categories' => 'Select at least one category.',
            ]);
        }

        $categories = [];
        foreach ($raw as $c) {
            if (! is_string($c)) {
                continue;
            }
            $c = trim($c);
            if ($c === '' || in_array($c, $categories, true)) {
                continue;
            }
            $categories[] = $c;
        }

        if ($categories === []) {
            throw ValidationException::withMessages([
                'categories' => 'Select at least one category.',
            ]);
        }
        if (count($categories) > Complaint::MAX_CATEGORIES) {
            throw ValidationException::withMessages([
                'categories' => 'Choose at most '.Complaint::MAX_CATEGORIES.' categories.',
            ]);
        }

        return $categories;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{0: ?string, 1: ?string}  [disk, path]
     */
    private function resolvePhoto(array $data): array
    {
        if (! empty($data['photo_path']) && is_string($data['photo_path'])) {
            return [
                isset($data['photo_disk']) && is_string($data['photo_disk'])
                    ? $data['photo_disk']
                    : ComplaintPhotoService::DISK,
                $data['photo_path'],
            ];
        }

        $uploadId = isset($data['photo_upload_id']) ? trim((string) $data['photo_upload_id']) : '';
        if ($uploadId === '') {
            return [null, null];
        }

        try {
            $path = app(ComplaintPhotoService::class)->pathForUploadId($uploadId);
            if ($path === null) {
                return [null, null];
            }

            return [ComplaintPhotoService::DISK, $path];
        } catch (\Throwable) {
            // Photo attach is best-effort — complaint must still save.
            return [null, null];
        }
    }

    /**
     * Bridge the legacy receipt_feedback form into the complaint notification path.
     */
    public function fromReceiptFeedback(Receipt $receipt, ReceiptFeedback $feedback): ?Complaint
    {
        $rating = (int) $feedback->rating;
        $comments = is_string($feedback->comments) ? trim($feedback->comments) : '';
        if ($comments === '' && $rating >= 3) {
            return null;
        }

        $receipt->loadMissing('order');

        return $this->create([
            'receipt' => $receipt,
            'order' => $receipt->order,
            'source' => 'receipt_feedback',
            'categories' => [Complaint::CATEGORY_SOMETHING_ELSE],
            'comment' => $comments !== ''
                ? $comments
                : "Receipt rating: {$rating}/5",
            'receipt_feedback_id' => $feedback->id,
            'idempotency_key' => 'receipt-feedback:'.$feedback->id,
        ]);
    }

    /**
     * @param  list<int>  $orderItemIds
     * @return list<array{order_item_id: int, item_name: string, quantity: float|int, unit_price_laar: int, line_total_laar: int}>
     */
    public function snapshotOrderItems(Order $order, array $orderItemIds): array
    {
        if ($orderItemIds === []) {
            return [];
        }

        $items = OrderItem::query()
            ->where('order_id', $order->id)
            ->whereIn('id', $orderItemIds)
            ->get();

        $out = [];
        foreach ($items as $item) {
            $unitLaar = (int) round(((float) $item->unit_price) * 100);
            $qty = (float) ($item->quantity ?? 1);
            $lineLaar = (int) round(((float) $item->total_price) * 100);
            if ($lineLaar <= 0) {
                $lineLaar = (int) round($unitLaar * $qty);
            }
            $out[] = [
                'order_item_id' => (int) $item->id,
                'item_name' => (string) ($item->item_name ?? 'Item'),
                'quantity' => $qty,
                'unit_price_laar' => $unitLaar,
                'line_total_laar' => $lineLaar,
            ];
        }

        return $out;
    }

    public function changeStatus(
        Complaint $complaint,
        string $toStatus,
        User $actor,
        ?string $internalNote = null,
        ?string $customerReply = null,
    ): Complaint {
        if (! in_array($toStatus, Complaint::STATUSES, true)) {
            throw ValidationException::withMessages(['status' => 'Invalid status.']);
        }

        $closing = in_array($toStatus, Complaint::CLOSED_STATUSES, true);
        $reply = is_string($customerReply) ? trim($customerReply) : '';
        if ($closing && $reply === '') {
            throw ValidationException::withMessages([
                'customer_reply' => 'A customer reply is required to close a complaint.',
            ]);
        }

        $from = $complaint->status;
        $note = is_string($internalNote) ? trim($internalNote) : '';

        DB::transaction(function () use ($complaint, $from, $toStatus, $actor, $note, $reply, $closing) {
            if ($note !== '') {
                $complaint->internal_note = $note;
            }
            if ($closing) {
                $complaint->customer_reply = $reply;
                $complaint->resolved_at = now();
                $complaint->resolved_by = $actor->id;
            }
            $complaint->status = $toStatus;
            $complaint->save();

            ComplaintStatusHistory::create([
                'complaint_id' => $complaint->id,
                'from_status' => $from,
                'to_status' => $toStatus,
                'changed_by_user_id' => $actor->id,
                'internal_note' => $note !== '' ? $note : null,
                'customer_reply' => $closing ? $reply : null,
            ]);
        });

        if ($toStatus === Complaint::STATUS_RESOLVED) {
            try {
                $this->notifications->notifyResolved($complaint->fresh(['order.customer', 'customer']));
            } catch (\Throwable) {
                // keep closed even if SMS fails
            }
        }

        return $complaint->fresh(['statusHistories', 'contactLogs', 'items']);
    }

    /**
     * Manager-led audit link only — never creates or approves a refund.
     */
    public function linkRefund(Complaint $complaint, Refund $refund, User $actor): Complaint
    {
        if ($complaint->order_id && (int) $refund->order_id !== (int) $complaint->order_id) {
            throw ValidationException::withMessages([
                'refund_id' => 'Refund must belong to the same order as the complaint.',
            ]);
        }

        if ($complaint->refund_id && (int) $complaint->refund_id !== (int) $refund->id) {
            throw ValidationException::withMessages([
                'refund_id' => 'This complaint is already linked to a different refund.',
            ]);
        }

        DB::transaction(function () use ($complaint, $refund, $actor) {
            $complaint->refund_id = $refund->id;
            $complaint->needs_refund_review = false;
            $complaint->save();

            ComplaintStatusHistory::create([
                'complaint_id' => $complaint->id,
                'from_status' => $complaint->status,
                'to_status' => $complaint->status,
                'changed_by_user_id' => $actor->id,
                'internal_note' => 'Linked refund #'.$refund->id.' for audit',
            ]);
        });

        return $complaint->fresh(['refund', 'statusHistories', 'items']);
    }

    public function addContactLog(
        Complaint $complaint,
        string $channel,
        string $note,
        User $actor,
    ): ComplaintContactLog {
        if (! in_array($channel, ComplaintContactLog::CHANNELS, true)) {
            throw ValidationException::withMessages(['channel' => 'Invalid channel.']);
        }
        $note = trim($note);
        if ($note === '') {
            throw ValidationException::withMessages(['note' => 'Note is required.']);
        }

        return ComplaintContactLog::create([
            'complaint_id' => $complaint->id,
            'channel' => $channel,
            'note' => $note,
            'logged_by_user_id' => $actor->id,
        ]);
    }
}
