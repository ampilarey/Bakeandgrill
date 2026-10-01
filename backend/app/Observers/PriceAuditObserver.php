<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\DailySpecial;
use App\Models\Item;
use App\Models\Promotion;
use App\Models\Variant;
use App\Services\AuditLogService;
use Illuminate\Database\Eloquent\Model;

/**
 * Who changed what a customer pays, and when (pricing audit, 2026-10-01,
 * finding 4).
 *
 * A selling price could be changed from the item editor, the quick-edit grid,
 * a bulk edit, a CSV import, a special or a promotion, and none of them left a
 * trace; snoozing an item did. Hooked on the models rather than on each
 * screen, so every one of those paths is covered by the same rule, and a path
 * added later is covered without anybody remembering to.
 *
 * Only the fields that change a price or when it applies are recorded, old and
 * new side by side, in the same audit log the Activity page reads.
 */
class PriceAuditObserver
{
    /** @var array<class-string<Model>, list<string>> */
    private const FIELDS = [
        Item::class => ['base_price', 'wholesale_price_laar', 'combo_discount_pct', 'packaging_fee'],
        Variant::class => ['price'],
        DailySpecial::class => [
            'item_id', 'special_price', 'discount_pct', 'start_date', 'end_date',
            'start_time', 'end_time', 'days_of_week', 'max_quantity', 'is_active',
        ],
        Promotion::class => [
            'name', 'code', 'type', 'discount_value', 'is_active', 'auto_apply', 'starts_at', 'expires_at',
            'days_of_week', 'starts_time', 'ends_time', 'max_uses', 'max_uses_per_customer',
            'min_order_laar', 'scope', 'budget_laar',
        ],
    ];

    /** @var array<class-string<Model>, string> */
    private const NAMES = [
        Item::class => 'item',
        Variant::class => 'size',
        DailySpecial::class => 'special',
        Promotion::class => 'promotion',
    ];

    public function created(Model $model): void
    {
        if ($model instanceof Item || $model instanceof Variant) {
            return; // a new item is not a price change
        }
        $this->write($model, 'created', [], $this->pick($model, $model->getAttributes()));
    }

    public function updated(Model $model): void
    {
        $fields = self::FIELDS[$model::class] ?? [];
        $changed = array_values(array_intersect($fields, array_keys($model->getChanges())));
        if ($changed === []) {
            return;
        }

        $old = [];
        $new = [];
        foreach ($changed as $field) {
            $old[$field] = $model->getOriginal($field);
            $new[$field] = $model->getAttribute($field);
        }

        $this->write($model, $model instanceof Item || $model instanceof Variant ? 'price_changed' : 'updated', $old, $new);
    }

    public function deleted(Model $model): void
    {
        if ($model instanceof Item || $model instanceof Variant) {
            return;
        }
        $this->write($model, 'deleted', $this->pick($model, $model->getOriginal()), []);
    }

    /**
     * @param array<string, mixed> $attributes
     * @return array<string, mixed>
     */
    private function pick(Model $model, array $attributes): array
    {
        return array_intersect_key($attributes, array_flip(self::FIELDS[$model::class] ?? []));
    }

    /**
     * @param array<string, mixed> $old
     * @param array<string, mixed> $new
     */
    private function write(Model $model, string $verb, array $old, array $new): void
    {
        try {
            $meta = match (true) {
                $model instanceof Item => ['name' => $model->name],
                $model instanceof Variant => ['name' => $model->name, 'item_id' => $model->item_id],
                $model instanceof DailySpecial => ['item_id' => $model->item_id],
                $model instanceof Promotion => ['name' => $model->name],
                default => [],
            };

            app(AuditLogService::class)->log(
                self::NAMES[$model::class] . '.' . $verb,
                class_basename($model),
                (int) $model->getKey(),
                $this->scalar($old),
                $this->scalar($new),
                $meta,
                app()->bound('request') ? request() : null,
            );
        } catch (\Throwable) {
            // The record is a convenience; a price change must never fail on it.
        }
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    private function scalar(array $values): array
    {
        return array_map(static function (mixed $v): mixed {
            if ($v instanceof \DateTimeInterface) {
                return $v->format('Y-m-d H:i:s');
            }
            if (is_string($v) && ($decoded = json_decode($v, true)) !== null && (str_starts_with($v, '[') || str_starts_with($v, '{'))) {
                return $decoded;
            }

            return $v;
        }, $values);
    }
}
