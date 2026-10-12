<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\LabelPrint;
use Carbon\CarbonImmutable;

/**
 * Printed stock that is about to expire (2026-10-12): the print log knows
 * what was stickered with which expiry, so it can say what in the freezer
 * is near its date before a customer finds out. One group per product,
 * batch and expiry, with every print in it; expired stock stays listed for
 * a couple of days so a missed one is still seen.
 */
final class ExpiringPrints
{
    /** Days an expired group stays on the list. */
    public const EXPIRED_KEPT_DAYS = 2;

    /** How many codes a group shows. */
    public const CODES_SHOWN = 5;

    /**
     * @return list<array{key: string, kind: 'item'|'custom'|'gone', id: ?int, name: string, copies: int, prints: int, batch_code: ?string, mfg_date: ?string, exp_date: string, days_left: int, codes: list<string>, last_printed_at: ?string, alerted: bool, print_ids: list<int>}>
     */
    public static function groups(int $days, ?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::today();
        $rows = LabelPrint::query()
            ->stickers()
            ->with(['item:id,name', 'customLabel:id,name'])
            ->whereNotNull('exp_date')
            ->whereDate('exp_date', '>=', $today->subDays(self::EXPIRED_KEPT_DAYS)->toDateString())
            ->whereDate('exp_date', '<=', $today->addDays(max(0, $days))->toDateString())
            ->orderBy('exp_date')
            ->orderByDesc('id')
            ->get();

        $groups = [];
        foreach ($rows as $p) {
            $kind = $p->item_id ? 'item' : ($p->custom_label_id ? 'custom' : 'gone');
            $id = $p->item_id ?? $p->custom_label_id;
            $exp = $p->exp_date->toDateString();
            $key = ($kind === 'gone' ? 'x' : ($kind === 'item' ? 'i' : 'c') . $id) . '|' . $exp . '|' . (string) $p->batch_code;
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'key' => $key,
                    'kind' => $kind,
                    'id' => $id,
                    'name' => (string) ($p->item?->name ?? $p->customLabel?->name ?? 'Removed product'),
                    'copies' => 0,
                    'prints' => 0,
                    'batch_code' => $p->batch_code,
                    'mfg_date' => $p->mfg_date?->toDateString(),
                    'exp_date' => $exp,
                    'days_left' => (int) $today->diffInDays(CarbonImmutable::parse($exp), false),
                    'codes' => [],
                    'last_printed_at' => $p->created_at?->toIso8601String(),
                    'alerted' => true,
                    'print_ids' => [],
                ];
            }
            $g = &$groups[$key];
            $g['copies'] += (int) $p->copies;
            $g['prints']++;
            if ($p->code !== null && count($g['codes']) < self::CODES_SHOWN) {
                $g['codes'][] = $p->code;
            }
            if ($p->expiry_alerted_at === null) {
                $g['alerted'] = false;
            }
            $g['print_ids'][] = (int) $p->id;
            unset($g);
        }

        return array_values($groups);
    }

    /**
     * The groups nobody has been told about yet, for the daily alert.
     *
     * @return list<array<string, mixed>>
     */
    public static function due(int $days, ?CarbonImmutable $today = null): array
    {
        return array_values(array_filter(self::groups($days, $today), fn (array $g) => !$g['alerted']));
    }

    /** "Bajiya ×24 (batch 261010) tomorrow", for the alert and the admin card. */
    public static function phrase(array $g, bool $withDate = true): string
    {
        $left = (int) $g['days_left'];
        $when = match (true) {
            $left > 1 => 'in ' . $left . ' days' . ($withDate ? ' (' . CarbonImmutable::parse($g['exp_date'])->format('j M') . ')' : ''),
            $left === 1 => 'tomorrow',
            $left === 0 => 'today',
            $left === -1 => 'expired yesterday',
            default => 'expired ' . abs($left) . ' days ago',
        };

        return $g['name'] . ' ×' . $g['copies'] . ($g['batch_code'] ? ' (batch ' . $g['batch_code'] . ')' : '') . ' ' . $when;
    }
}
