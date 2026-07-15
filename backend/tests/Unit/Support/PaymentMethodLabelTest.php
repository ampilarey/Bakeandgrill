<?php

declare(strict_types=1);

namespace Tests\Unit\Support;

use App\Support\PaymentMethodLabel;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class PaymentMethodLabelTest extends TestCase
{
    #[Test]
    #[DataProvider('labels')]
    public function it_maps_pos_tender_slugs_to_labels(string $slug, string $expected): void
    {
        $this->assertSame($expected, PaymentMethodLabel::for($slug));
    }

    /** @return list<array{0: string, 1: string}> */
    public static function labels(): array
    {
        return [
            ['cash', 'Cash'],
            ['card', 'Card'],
            ['card_pos', 'Card'],
            ['qr', 'QR'],
            ['bank_transfer', 'Transfer'],
            ['digital_wallet', 'Transfer'],
            ['house_account', 'Credit'],
            ['wallet', 'Deposit'],
        ];
    }

    #[Test]
    public function qr_is_pos_card_like_for_commission(): void
    {
        $this->assertTrue(PaymentMethodLabel::isPosCardLike('qr'));
        $this->assertTrue(PaymentMethodLabel::isPosCardLike('card'));
        $this->assertFalse(PaymentMethodLabel::isPosCardLike('cash'));
        $this->assertFalse(PaymentMethodLabel::isPosCardLike('bank_transfer'));
    }
}
