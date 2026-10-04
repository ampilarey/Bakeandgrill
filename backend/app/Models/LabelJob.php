<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved label print: the request as it was sent, so it can be printed
 * again, downloaded, edited, copied or renamed (docs/LABEL_HUB_V2_PLAN.md
 * point 10).
 */
class LabelJob extends Model
{
    public const KINDS = ['stickers', 'box'];

    protected $fillable = ['kind', 'name', 'request', 'summary', 'request_hash', 'created_by', 'print_count', 'last_printed_at'];

    protected function casts(): array
    {
        return ['request' => 'array', 'summary' => 'array', 'print_count' => 'integer', 'last_printed_at' => 'datetime'];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** @param array<string, mixed> $request */
    public static function hashOf(string $kind, array $request): string
    {
        ksort($request);

        return hash('sha256', $kind . '|' . json_encode($request, JSON_UNESCAPED_UNICODE));
    }
}
