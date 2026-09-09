<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * What one brand of one ingredient looks like on the shelf.
 * See the migration for why this sits beside the free-text brand rather
 * than turning brands into a register of their own.
 */
class InventoryBrandPhoto extends Model
{
    protected $fillable = [
        'inventory_item_id', 'brand', 'brand_key', 'file_path',
        'original_filename', 'mime_type', 'size', 'note', 'uploaded_by',
    ];

    /**
     * The brand as a lookup key: lower case, ends trimmed, runs of
     * whitespace collapsed. "Sunrise", "sunrise" and " Sunrise  " are one
     * brand to the person buying, so they are one key here.
     */
    public static function keyFor(?string $brand): string
    {
        return mb_strtolower(trim(preg_replace('/\s+/u', ' ', (string) $brand) ?? ''));
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(InventoryItem::class, 'inventory_item_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /** Null for a brand somebody has written down but not photographed yet. */
    public function url(): ?string
    {
        return $this->file_path === null ? null : Storage::disk('public')->url($this->file_path);
    }

    /** @return array<string, mixed> */
    public function toPayload(): array
    {
        return [
            'id' => $this->id,
            'brand' => $this->brand,
            'url' => $this->url(),
            'note' => $this->note,
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Brand key → payload, for every brand of the given items. One query,
     * so a list of twenty shop-run lines does not become twenty.
     *
     * @param list<int> $itemIds
     * @return array<int, array<string, array<string, mixed>>> item id → brand key → payload
     */
    public static function forItems(array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        $out = [];
        foreach (static::query()->whereIn('inventory_item_id', $itemIds)->get() as $photo) {
            $out[(int) $photo->inventory_item_id][$photo->brand_key] = $photo->toPayload();
        }

        return $out;
    }
}
