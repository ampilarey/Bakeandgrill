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
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ComplaintService
{
    public function __construct(
        private readonly ComplaintNotificationService $notifications,
    ) {}

    /**
     * @param  list<array{order_item_id?: int|null, item_name: string, quantity?: float|int, unit_price_laar?: int, line_total_laar?: int}>  $items
     * @param  array{
     *   receipt?: ?Receipt,
     *   invoice?: ?Invoice,
     *   order?: ?Order,
     *   source?: string,
     *   category: string,
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

        $category = (string) $data['category'];
        $isFoodSafety = $category === Complaint::CATEGORY_FOOD_SAFETY;
        $needsRefund = in_array($category, [
            Complaint::CATEGORY_WRONG_AMOUNT,
            Complaint::CATEGORY_BILL_WRONG_AMOUNT,
        ], true);

        [$photoDisk, $photoPath] = $this->resolvePhoto($data);

        $complaint = DB::transaction(function () use ($data, $receipt, $invoice, $order, $category, $isFoodSafety, $needsRefund, $photoDisk, $photoPath) {
            $complaint = Complaint::create([
                'reference_number' => 'PENDING',
                'receipt_id' => $receipt?->id,
                'invoice_id' => $invoice?->id,
                'order_id' => $order?->id,
                'customer_id' => $order?->customer_id,
                'receipt_feedback_id' => $data['receipt_feedback_id'] ?? null,
                'source' => $data['source'] ?? ($invoice ? 'invoice' : 'receipt'),
                'category' => $category,
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
            'category' => Complaint::CATEGORY_SOMETHING_ELSE,
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
        ?string $resolutionNote = null,
    ): Complaint {
        if (! in_array($toStatus, Complaint::STATUSES, true)) {
            throw ValidationException::withMessages(['status' => 'Invalid status.']);
        }

        $closing = in_array($toStatus, Complaint::CLOSED_STATUSES, true);
        if ($closing && (trim((string) $resolutionNote) === '')) {
            throw ValidationException::withMessages([
                'resolution_note' => 'A resolution note is required to close a complaint.',
            ]);
        }

        $from = $complaint->status;

        DB::transaction(function () use ($complaint, $from, $toStatus, $actor, $internalNote, $resolutionNote, $closing) {
            $complaint->status = $toStatus;
            if ($closing) {
                $complaint->resolution_note = trim((string) $resolutionNote);
                $complaint->resolved_at = now();
                $complaint->resolved_by = $actor->id;
            }
            $complaint->save();

            ComplaintStatusHistory::create([
                'complaint_id' => $complaint->id,
                'from_status' => $from,
                'to_status' => $toStatus,
                'changed_by_user_id' => $actor->id,
                'internal_note' => $internalNote,
                'resolution_note' => $closing ? trim((string) $resolutionNote) : null,
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
