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

    protected $fillable = ['kind', 'name', 'pinned', 'request', 'summary', 'request_hash', 'created_by', 'print_count', 'last_printed_at'];

    protected function casts(): array
    {
        return ['request' => 'array', 'summary' => 'array', 'pinned' => 'boolean', 'print_count' => 'integer', 'last_printed_at' => 'datetime'];
    }

    /** How Print again dates the stickers (label audit, 2026-10-16). */
    public const DATE_MODES = ['shelf', 'keep'];

    /** Where the choice is kept: in the saved request, which StickerSheet::normalise() ignores. */
    public const DATES_KEY = 'reprint_dates';

    /**
     * "shelf": made-on today, use-by from the shelf life. "keep": the typed
     * use-by stays. Unchosen, a label with a typed use-by keeps it and one
     * without works it out (as LabelJobsTest's "Reprint a week later").
     *
     * @param array<string, mixed> $request
     */
    public static function dateMode(array $request): string
    {
        $chosen = $request[self::DATES_KEY] ?? null;
        if (in_array($chosen, self::DATE_MODES, true)) {
            return $chosen;
        }

        return self::typedExp($request) !== null ? 'keep' : 'shelf';
    }

    /**
     * The use-by typed on the label, the sheet's or the earliest row's; null when none.
     *
     * @param array<string, mixed> $request
     */
    public static function typedExp(array $request): ?string
    {
        $dates = [];
        if (!empty($request['exp'])) {
            $dates[] = (string) $request['exp'];
        }
        foreach (($request['items'] ?? []) as $row) {
            if (is_array($row) && !empty($row['exp'])) {
                $dates[] = (string) $row['exp'];
            }
        }
        sort($dates);

        return $dates[0] ?? null;
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
