<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Complaint extends Model
{
    public const STATUS_NEW = 'new';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_AWAITING_CUSTOMER = 'awaiting_customer';

    public const STATUS_RESOLVED = 'resolved';

    public const STATUS_NOT_ACTIONABLE = 'not_actionable';

    public const STATUSES = [
        self::STATUS_NEW,
        self::STATUS_IN_PROGRESS,
        self::STATUS_AWAITING_CUSTOMER,
        self::STATUS_RESOLVED,
        self::STATUS_NOT_ACTIONABLE,
    ];

    public const CLOSED_STATUSES = [
        self::STATUS_RESOLVED,
        self::STATUS_NOT_ACTIONABLE,
    ];

    public const CATEGORY_WRONG_ITEM = 'wrong_item';

    public const CATEGORY_MISSING_ITEM = 'missing_item';

    public const CATEGORY_FOOD_QUALITY = 'food_quality';

    public const CATEGORY_FOOD_SAFETY = 'food_safety';

    public const CATEGORY_WRONG_AMOUNT = 'wrong_amount';

    public const CATEGORY_TOO_LONG = 'too_long';

    public const CATEGORY_DELIVERY = 'delivery_problem';

    public const CATEGORY_SOMETHING_ELSE = 'something_else';

    public const CATEGORY_BILL_WRONG_AMOUNT = 'bill_wrong_amount';

    public const CATEGORY_BILL_WRONG_ITEMS = 'bill_wrong_items';

    public const CATEGORY_BILL_ALREADY_PAID = 'bill_already_paid';

    public const RECEIPT_CATEGORIES = [
        self::CATEGORY_WRONG_ITEM,
        self::CATEGORY_MISSING_ITEM,
        self::CATEGORY_FOOD_QUALITY,
        self::CATEGORY_FOOD_SAFETY,
        self::CATEGORY_WRONG_AMOUNT,
        self::CATEGORY_TOO_LONG,
        self::CATEGORY_DELIVERY,
        self::CATEGORY_SOMETHING_ELSE,
    ];

    public const INVOICE_CATEGORIES = [
        self::CATEGORY_BILL_WRONG_AMOUNT,
        self::CATEGORY_BILL_WRONG_ITEMS,
        self::CATEGORY_BILL_ALREADY_PAID,
        self::CATEGORY_SOMETHING_ELSE,
    ];

    public const OWNER_ALERT_PENDING = 'pending';

    public const OWNER_ALERT_SENT = 'sent';

    public const OWNER_ALERT_SUPPRESSED = 'suppressed';

    public const OWNER_ALERT_FAILED = 'failed';

    public const OWNER_ALERT_RETRIED = 'retried';

    protected $fillable = [
        'reference_number',
        'receipt_id',
        'invoice_id',
        'order_id',
        'customer_id',
        'receipt_feedback_id',
        'source',
        'category',
        'comment',
        'photo_disk',
        'photo_path',
        'status',
        'needs_refund_review',
        'refund_id',
        'is_food_safety',
        'shift_id',
        'cashier_user_id',
        'owner_alert_status',
        'owner_alert_detail',
        'resolution_note',
        'resolved_at',
        'resolved_by',
        'idempotency_key',
    ];

    protected $casts = [
        'needs_refund_review' => 'boolean',
        'is_food_safety' => 'boolean',
        'resolved_at' => 'datetime',
    ];

    public function receipt(): BelongsTo
    {
        return $this->belongsTo(Receipt::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function receiptFeedback(): BelongsTo
    {
        return $this->belongsTo(ReceiptFeedback::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_user_id');
    }

    public function refund(): BelongsTo
    {
        return $this->belongsTo(Refund::class);
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ComplaintItem::class);
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(ComplaintStatusHistory::class)->orderBy('id');
    }

    public function contactLogs(): HasMany
    {
        return $this->hasMany(ComplaintContactLog::class)->orderByDesc('id');
    }

    public function isClosed(): bool
    {
        return in_array($this->status, self::CLOSED_STATUSES, true);
    }

    public static function categoryLabel(string $category): string
    {
        return match ($category) {
            self::CATEGORY_WRONG_ITEM => 'Wrong item',
            self::CATEGORY_MISSING_ITEM => 'Missing item',
            self::CATEGORY_FOOD_QUALITY => 'Food quality',
            self::CATEGORY_FOOD_SAFETY => 'Food safety or allergy concern',
            self::CATEGORY_WRONG_AMOUNT => 'Charged the wrong amount',
            self::CATEGORY_TOO_LONG => 'Took too long',
            self::CATEGORY_DELIVERY => 'Delivery problem',
            self::CATEGORY_BILL_WRONG_AMOUNT => 'Wrong amount',
            self::CATEGORY_BILL_WRONG_ITEMS => 'Wrong items billed',
            self::CATEGORY_BILL_ALREADY_PAID => 'Already paid',
            default => 'Something else',
        };
    }
}
