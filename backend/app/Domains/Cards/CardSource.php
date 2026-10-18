<?php

declare(strict_types=1);

namespace App\Domains\Cards;

use App\Domains\Payments\Services\GiftCardCodeService;
use App\Models\DiscountCardBatch;
use App\Models\Promotion;
use Carbon\CarbonInterface;
use Illuminate\Validation\ValidationException;

/**
 * Where a print run's codes come from: a discount card batch (a code of its own on every
 * card), one promotion's code, a gift card just issued, or none (a loyalty or plain card).
 * The QR on a card opens the order app with the code filled in (`?promo=` / `?gift=`,
 * read by the order app's `cardCode.ts`).
 */
final class CardSource
{
    public const MAX_CARDS = 500;

    public const TYPES = ['discount_batch', 'promotion', 'gift_card', 'none'];

    public function __construct(private readonly GiftCardCodeService $giftCodes) {}

    /**
     * @param array<string, mixed> $src type, id, code, copies, start, count
     * @return array{type: string, id: ?int, kind: string, entries: list<array{code: ?string, value: string, expiry: ?CarbonInterface, qr: ?string, number: int, of: int}>}
     */
    public function resolve(array $src): array
    {
        $type = in_array($src['type'] ?? null, self::TYPES, true) ? (string) $src['type'] : 'none';
        $copies = max(1, min(self::MAX_CARDS, (int) ($src['copies'] ?? 1)));

        if ($type === 'discount_batch') {
            $batch = DiscountCardBatch::query()->find((int) ($src['id'] ?? 0));
            if ($batch === null) {
                throw ValidationException::withMessages(['source.id' => 'That discount card batch was not found.']);
            }
            $codes = $batch->cardsQuery()->withoutTrashed()->where('is_active', true)->pluck('code')->all();
            $of = count($codes);
            $start = max(1, (int) ($src['start'] ?? 1));
            $count = max(1, min(self::MAX_CARDS, (int) ($src['count'] ?? $of)));
            $value = self::valueText((string) $batch->type, (int) $batch->discount_value);
            $entries = [];
            foreach (array_slice($codes, $start - 1, $count) as $i => $code) {
                $entries[] = ['code' => (string) $code, 'value' => $value, 'expiry' => $batch->expires_at, 'qr' => self::orderUrl('promo', (string) $code), 'number' => $start + $i, 'of' => $of];
            }
            if ($entries === []) {
                throw ValidationException::withMessages(['source.start' => 'No active cards in that range.']);
            }

            return ['type' => $type, 'id' => $batch->id, 'kind' => 'discount', 'entries' => $entries];
        }

        if ($type === 'promotion') {
            $promo = Promotion::query()->find((int) ($src['id'] ?? 0));
            if ($promo === null || trim((string) $promo->code) === '') {
                throw ValidationException::withMessages(['source.id' => 'That promotion has no code to print.']);
            }
            $code = (string) $promo->code;
            $value = self::valueText((string) $promo->type, (int) $promo->discount_value);

            return ['type' => $type, 'id' => $promo->id, 'kind' => 'promo', 'entries' => self::copies($copies, $code, $value, $promo->expires_at, self::orderUrl('promo', $code))];
        }

        if ($type === 'gift_card') {
            $code = strtoupper(trim((string) ($src['code'] ?? '')));
            $card = $code !== '' ? $this->giftCodes->findByCode($code) : null;
            if ($card === null || $card->status === 'cancelled') {
                throw ValidationException::withMessages(['source.code' => 'That gift card code was not found.']);
            }
            $value = 'MVR ' . number_format((float) $card->current_balance, 2);

            return ['type' => $type, 'id' => $card->id, 'kind' => 'gift', 'entries' => self::copies($copies, $code, $value, $card->expires_at, self::orderUrl('gift', $code))];
        }

        return ['type' => 'none', 'id' => null, 'kind' => 'plain', 'entries' => self::copies($copies, null, '', null, null)];
    }

    /** A sample run for the designer's preview, before any codes are picked. */
    public static function sample(string $kind): array
    {
        $value = match ($kind) {
            'gift' => 'MVR 500.00',
            'promo' => '15% OFF',
            'loyalty', 'plain' => '',
            default => '20% OFF',
        };
        $code = in_array($kind, ['loyalty', 'plain'], true) ? null : 'SAMPLE-7K2Q';

        return ['type' => 'none', 'id' => null, 'kind' => $kind, 'entries' => self::copies(1, $code, $value, now()->addMonths(6), $code !== null ? self::orderUrl($kind === 'gift' ? 'gift' : 'promo', $code) : null)];
    }

    public static function valueText(string $type, int $value): string
    {
        return match ($type) {
            'percentage', 'percent' => $value . '% OFF',
            'fixed', 'fixed_amount' => 'MVR ' . rtrim(rtrim(number_format($value / 100, 2, '.', ''), '0'), '.') . ' OFF',
            'free_delivery' => 'FREE DELIVERY',
            'free_item', 'buy_x_get_y' => 'FREE ITEM',
            default => '',
        };
    }

    public static function orderUrl(string $param, string $code): string
    {
        return rtrim((string) config('app.url'), '/') . '/order/?' . $param . '=' . rawurlencode($code);
    }

    /** @return list<array{code: ?string, value: string, expiry: ?CarbonInterface, qr: ?string, number: int, of: int}> */
    private static function copies(int $n, ?string $code, string $value, ?CarbonInterface $expiry, ?string $qr): array
    {
        $out = [];
        for ($i = 1; $i <= $n; $i++) {
            $out[] = ['code' => $code, 'value' => $value, 'expiry' => $expiry, 'qr' => $qr, 'number' => $i, 'of' => $n];
        }

        return $out;
    }
}
