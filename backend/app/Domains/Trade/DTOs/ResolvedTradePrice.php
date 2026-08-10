<?php

declare(strict_types=1);

namespace App\Domains\Trade\DTOs;

/**
 * Result of {@see \App\Domains\Trade\Services\TradePriceResolver::resolve()}.
 *
 * When {@see $found} is false, there is no wholesale price — callers must
 * not treat {@see $priceLaar} as meaningful (it is 0 only as a placeholder).
 * A found price of 0 laari is a real agreed price.
 */
final readonly class ResolvedTradePrice
{
    public const SOURCE_ACCOUNT_LIST = 'account_list';

    public const SOURCE_ITEM_WHOLESALE = 'item_wholesale';

    public const SOURCE_RETAIL_DISCOUNT = 'retail_discount';

    public const SOURCE_NONE = 'none';

    public function __construct(
        public bool $found,
        public int $priceLaar,
        public string $source,
    ) {}

    public static function none(): self
    {
        return new self(false, 0, self::SOURCE_NONE);
    }

    public static function of(int $priceLaar, string $source): self
    {
        return new self(true, $priceLaar, $source);
    }

    /** @return array{found: bool, price_laar: int|null, source: string, price_mvr: string|null} */
    public function toArray(): array
    {
        return [
            'found' => $this->found,
            'price_laar' => $this->found ? $this->priceLaar : null,
            'price_mvr' => $this->found
                ? number_format($this->priceLaar / 100, 2, '.', '')
                : null,
            'source' => $this->source,
        ];
    }
}
