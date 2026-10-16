<?php

declare(strict_types=1);

namespace App\Domains\Labels;

use App\Models\LabelPrint;
use Carbon\CarbonImmutable;

/**
 * Scan to reprint (round 11 of the usability work, owner, 2026-10-13: "scan
 * a pack's QR with the phone and reprint that exact label"). Every sticker
 * print keeps the request that made it, narrowed to its own product
 * (`label_prints.request`), so the code on a pack opens Print labels on that
 * very label: the same product, size, language, dates, batch, packed-for,
 * bottom strip and flash. A print from before this round is rebuilt from the
 * log's columns. The reprint is a new print with a code of its own, logged
 * with `reprint_of` so the log says which pack it stood in for.
 */
final class Reprint
{
    /** The sticker request keys a print keeps, the ones a saved label keeps (`roll`: the roll it is counted off, round 13). */
    public const KEYS = ['lang', 'layout', 'w', 'h', 'fill', 'mfg', 'exp', 'batch', 'qty', 'pi', 'type', 'footer', 'rounded', 'for', 'for2', 'promo', 'promo_was', 'promo_now', 'promo_text', 'number', 'marks', 'bleed', 'roll'];

    /**
     * The request one product's print replays: the sheet's settings with the
     * items narrowed to that product's row, its own details (round 10) kept.
     *
     * @param array<string, mixed> $req from StickerSheet::normalise()
     * @param array{kind: string, id: int|string, copies: int} $product a summary product
     * @return array<string, mixed>
     */
    public static function of(array $req, array $product): array
    {
        $row = null;
        foreach ($req['items'] as $r) {
            // Two sizes of one item are two rows: replay the one this print was (label audit, 2026-10-16).
            $size = isset($product['size']['id']) ? (string) $product['size']['id'] : '';
            if (($r['kind'] ?? 'item') === $product['kind'] && (string) $r['id'] === (string) $product['id'] && (string) ($r['run']['size'] ?? '') === $size) {
                $row = $r;
                break;
            }
        }
        $item = ['id' => (int) $product['id'], 'copies' => (int) $product['copies'], 'kind' => $product['kind']];
        foreach ($row['run'] ?? [] as $k => $v) {
            $item[$k] = $k === 'qty' ? (int) $v : $v;
        }
        $out = ['items' => [$item]];
        foreach (self::KEYS as $k) {
            $v = $req[$k] ?? null;
            if ($v === '' || $v === null) {
                $v = null;
            } elseif ($k === 'qty') {
                $v = (int) $v;
            } elseif ($k === 'bleed') {
                $v = !empty($req['marks']) && (float) $v > 0 ? (float) $v : null;
            }
            $out[$k] = $v;
        }

        return $out;
    }

    /**
     * The request to replay for a print logged before requests were kept:
     * what the log's columns say, on one product. Null when it is gone.
     *
     * @return ?array<string, mixed>
     */
    public static function rebuilt(LabelPrint $print): ?array
    {
        $kind = $print->item_id !== null ? 'item' : ($print->custom_label_id !== null ? 'custom' : null);
        if ($kind === null) {
            return null;
        }
        $details = is_array($print->details) ? $print->details : [];
        $out = ['items' => [['id' => (int) ($print->item_id ?? $print->custom_label_id), 'copies' => max(1, (int) $print->copies), 'kind' => $kind]]];
        foreach (self::KEYS as $k) {
            $out[$k] = null;
        }
        $out['lang'] = match ($print->kind) {
            'sticker_dv' => 'dv', 'sticker_both' => 'both', default => 'en',
        };
        $out['layout'] = (string) $print->layout;
        $out['w'] = $print->label_w_mm !== null ? (float) $print->label_w_mm : null;
        $out['h'] = $print->label_h_mm !== null ? (float) $print->label_h_mm : null;
        $out['fill'] = $print->mfg_date !== null || $print->exp_date !== null;
        $out['mfg'] = $print->mfg_date?->toDateString();
        $out['exp'] = $print->exp_date?->toDateString();
        $out['batch'] = $print->batch_code;
        $out['qty'] = $print->pack_qty;
        $out['for'] = isset($details['for']) && $details['for'] !== '' ? (string) $details['for'] : null;
        $out['for2'] = isset($details['for2']) && $details['for2'] !== '' ? (string) $details['for2'] : null;
        $out['rounded'] = false;
        $out['number'] = false;
        $out['marks'] = false;

        return $out;
    }

    /** "fresh", "soon" (within two days), "today", "expired", or null without an expiry; the pack page's words too. */
    public static function status(?int $daysLeft): ?string
    {
        return match (true) {
            $daysLeft === null => null,
            $daysLeft < 0 => 'expired',
            $daysLeft === 0 => 'today',
            $daysLeft <= 2 => 'soon',
            default => 'fresh',
        };
    }

    /**
     * What the admin is told about a scanned code: the pack and the request
     * that prints its sticker again (null when the product is gone).
     *
     * @return array<string, mixed>
     */
    public static function present(LabelPrint $print, ?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::today();
        $product = $print->item ?? $print->customLabel;
        $exp = $print->exp_date?->toDateString();
        $left = $exp !== null ? (int) $today->diffInDays(CarbonImmutable::parse($exp), false) : null;
        $details = is_array($print->details) ? $print->details : [];
        $kept = is_array($print->request) && $print->request !== [] ? $print->request : null;

        return [
            'code' => $print->code,
            'kind' => $print->kind,
            'layout' => $print->layout,
            'stock' => StickerLayouts::describe((string) $print->layout, $print->label_w_mm !== null ? (float) $print->label_w_mm : null, $print->label_h_mm !== null ? (float) $print->label_h_mm : null),
            'product' => $product === null ? null : ['kind' => $print->item_id !== null ? 'item' : 'custom', 'id' => (int) $product->id, 'name' => (string) $product->name],
            'copies' => (int) $print->copies,
            'mfg_date' => $print->mfg_date?->toDateString(),
            'exp_date' => $exp,
            'days_left' => $left,
            'status' => self::status($left),
            'batch_code' => $print->batch_code,
            'pack_qty' => $print->pack_qty,
            'for' => isset($details['for']) && $details['for'] !== '' ? (string) $details['for'] : null,
            'for2' => isset($details['for2']) && $details['for2'] !== '' ? (string) $details['for2'] : null,
            'reprint_of' => isset($details['reprint_of']) && $details['reprint_of'] !== '' ? (string) $details['reprint_of'] : null,
            'printed_by' => $print->printer?->name,
            'printed_at' => $print->created_at?->toIso8601String(),
            'batch_url' => $print->code !== null ? BatchLink::path($print->code) : null,
            'request' => $product === null ? null : ($kept ?? self::rebuilt($print)),
        ];
    }
}
