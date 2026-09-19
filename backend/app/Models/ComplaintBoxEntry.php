<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One complaint from the public complaint form — about the place, the
 * staff or the food, from anybody, with or without an order and with or
 * without a name. Distinct from `Complaint`, which is a problem with a
 * specific receipt or invoice (owner, 2026-09-19).
 */
class ComplaintBoxEntry extends Model
{
    public const STATUS_NEW = 'new';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_RESOLVED = 'resolved';

    public const STATUS_CLOSED = 'closed';

    public const STATUSES = [
        self::STATUS_NEW,
        self::STATUS_IN_PROGRESS,
        self::STATUS_RESOLVED,
        self::STATUS_CLOSED,
    ];

    public const OPEN_STATUSES = [self::STATUS_NEW, self::STATUS_IN_PROGRESS];

    public const CATEGORY_STAFF_BEHAVIOUR = 'staff_behaviour';

    public const CATEGORY_SLOW_SERVICE = 'slow_service';

    public const CATEGORY_FOOD_QUALITY = 'food_quality';

    public const CATEGORY_FOOD_SAFETY = 'food_safety';

    public const CATEGORY_CLEANLINESS = 'cleanliness';

    public const CATEGORY_PRICING = 'pricing';

    public const CATEGORY_OTHER = 'other';

    /** In the order the form shows them: staff first, because that is what prompted this. */
    public const CATEGORIES = [
        self::CATEGORY_STAFF_BEHAVIOUR,
        self::CATEGORY_SLOW_SERVICE,
        self::CATEGORY_FOOD_QUALITY,
        self::CATEGORY_FOOD_SAFETY,
        self::CATEGORY_CLEANLINESS,
        self::CATEGORY_PRICING,
        self::CATEGORY_OTHER,
    ];

    public const STAFF_CATEGORIES = [self::CATEGORY_STAFF_BEHAVIOUR, self::CATEGORY_SLOW_SERVICE];

    public const MAX_CATEGORIES = 3;

    protected $fillable = [
        'reference_number', 'categories', 'about_staff', 'comment', 'phone', 'is_anonymous',
        'order_ref', 'visited_on', 'source', 'status', 'owner_alert_status', 'owner_alert_detail',
        'internal_note', 'last_message', 'last_message_at', 'taken_up_at', 'resolved_at',
        'resolved_by', 'ip_hash',
    ];

    protected $casts = [
        'categories' => 'array',
        'is_anonymous' => 'boolean',
        'visited_on' => 'date',
        'last_message_at' => 'datetime',
        'taken_up_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    /** The number is never sent to the browser as-is: the list shows it masked. */
    protected $hidden = ['ip_hash'];

    public static function categoryLabel(string $category): string
    {
        return match ($category) {
            self::CATEGORY_STAFF_BEHAVIOUR => 'Staff behaviour',
            self::CATEGORY_SLOW_SERVICE => 'Slow or poor service',
            self::CATEGORY_FOOD_QUALITY => 'Food quality',
            self::CATEGORY_FOOD_SAFETY => 'Food safety or allergy',
            self::CATEGORY_CLEANLINESS => 'Cleanliness',
            self::CATEGORY_PRICING => 'Pricing or billing',
            default => 'Something else',
        };
    }

    /** @return list<array{value: string, label: string}> */
    public static function categoryOptions(): array
    {
        return array_map(fn (string $c) => ['value' => $c, 'label' => self::categoryLabel($c)], self::CATEGORIES);
    }

    /** @return list<string> */
    public function categoryList(): array
    {
        return array_values(array_filter(array_map('strval', (array) ($this->categories ?? []))));
    }

    public function categoriesLabel(): string
    {
        return implode(', ', array_map(fn (string $c) => self::categoryLabel($c), $this->categoryList()));
    }

    public function isAboutStaff(): bool
    {
        return array_intersect($this->categoryList(), self::STAFF_CATEGORIES) !== [];
    }

    public function isOpen(): bool
    {
        return in_array((string) $this->status, self::OPEN_STATUSES, true);
    }

    public function events(): HasMany
    {
        return $this->hasMany(ComplaintBoxEvent::class, 'entry_id')->orderBy('id');
    }

    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
