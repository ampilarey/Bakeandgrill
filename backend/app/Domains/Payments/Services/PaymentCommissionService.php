<?php

declare(strict_types=1);

namespace App\Domains\Payments\Services;

use App\Models\Payment;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;

class PaymentCommissionService
{
    public const CHANNEL_POS_CARD = 'pos_card';

    public const CHANNEL_ONLINE_GATEWAY = 'online_gateway';

    public const MAX_RATE_BP = 1000;

    /** @var list<string> */
    private const POS_CARD_METHODS = ['card', 'card_pos', 'qr'];

    /** @var list<string> */
    private const GATEWAY_METHODS = ['bml_connect', 'bml_pay', 'bml', 'online'];

    /** @var list<string> */
    public const SETTLED_STATUSES = ['paid', 'completed', 'confirmed'];

    public function currentSettings(): array
    {
        $enabled = SiteSetting::get('payment_commission_enabled', '1') === '1';
        $posRateBp = max(0, min(self::MAX_RATE_BP, (int) SiteSetting::get('payment_commission_pos_card_rate_bp', '250')));
        $gatewayRateBp = max(0, min(self::MAX_RATE_BP, (int) SiteSetting::get('payment_commission_online_gateway_rate_bp', '250')));

        return [
            'enabled' => $enabled,
            'pos_card_rate_bp' => $posRateBp,
            'online_gateway_rate_bp' => $gatewayRateBp,
            'pos_card_rate_percent' => round($posRateBp / 100, 2),
            'online_gateway_rate_percent' => round($gatewayRateBp / 100, 2),
        ];
    }

    public function isEnabled(): bool
    {
        return SiteSetting::get('payment_commission_enabled', '1') === '1';
    }

    public function resolveChannel(Payment $payment): ?string
    {
        $method = strtolower((string) $payment->method);
        $gateway = strtolower((string) ($payment->gateway ?? ''));

        if ($gateway === 'bml' || in_array($method, self::GATEWAY_METHODS, true)) {
            return self::CHANNEL_ONLINE_GATEWAY;
        }

        if (in_array($method, self::POS_CARD_METHODS, true)) {
            return self::CHANNEL_POS_CARD;
        }

        return null;
    }

    public function rateBpForChannel(string $channel): int
    {
        $key = $channel === self::CHANNEL_POS_CARD
            ? 'payment_commission_pos_card_rate_bp'
            : 'payment_commission_online_gateway_rate_bp';

        return max(0, min(self::MAX_RATE_BP, (int) SiteSetting::get($key, '250')));
    }

    public function isCommissionable(Payment $payment): bool
    {
        if (!$this->isEnabled()) {
            return false;
        }

        return $this->resolveChannel($payment) !== null;
    }

    public function calculateCommissionLaar(int $amountLaar, int $rateBp): int
    {
        if ($amountLaar <= 0 || $rateBp <= 0) {
            return 0;
        }

        return (int) floor($amountLaar * $rateBp / 10000);
    }

    public function applyToPayment(Payment $payment): void
    {
        if ($payment->commission_channel !== null) {
            return;
        }

        if (!in_array((string) $payment->status, self::SETTLED_STATUSES, true)) {
            return;
        }

        $channel = $this->resolveChannel($payment);
        if ($channel === null || !$this->isEnabled()) {
            return;
        }

        $amountLaar = (int) ($payment->amount_laar ?? round((float) $payment->amount * 100));
        if ($amountLaar <= 0) {
            return;
        }

        $rateBp = $this->rateBpForChannel($channel);

        $payment->update([
            'commission_laar' => $this->calculateCommissionLaar($amountLaar, $rateBp),
            'commission_rate_bp' => $rateBp,
            'commission_channel' => $channel,
        ]);

        app(PaymentCommissionExpenseService::class)->syncForPayment($payment->fresh());
    }

    /**
     * @param array{user_id?: int|null, shift_id?: int|null, device_id?: int|null, payment_query?: callable(Builder): void|null} $filters
     */
    public function paymentCommissionSummary(Carbon $from, Carbon $to, array $filters = []): array
    {
        $settings = $this->currentSettings();
        $payLaar = 'COALESCE(payments.amount_laar, ROUND(payments.amount * 100))';

        $base = Payment::query()
            ->whereBetween('payments.processed_at', [$from, $to])
            ->whereIn('payments.status', self::SETTLED_STATUSES)
            ->whereNotNull('payments.commission_channel')
            ->whereHas('order', function ($oq) use ($filters) {
                $oq->whereIn('status', \App\Domains\Reporting\Support\ReportMoneySql::SALE_STATUSES)
                    ->when(isset($filters['user_id']), fn ($q) => $q->where('user_id', $filters['user_id']))
                    ->when(isset($filters['shift_id']), fn ($q) => $q->where('shift_id', $filters['shift_id']))
                    ->when(isset($filters['device_id']), fn ($q) => $q->where('device_id', $filters['device_id']));
            });

        if (isset($filters['payment_query']) && is_callable($filters['payment_query'])) {
            ($filters['payment_query'])($base);
        }

        $channelRows = (clone $base)
            ->select('payments.commission_channel')
            ->selectRaw('ROUND(COALESCE(SUM(' . $payLaar . '), 0) / 100.0, 2) as gross')
            ->selectRaw('ROUND(COALESCE(SUM(payments.commission_laar), 0) / 100.0, 2) as commission')
            ->groupBy('payments.commission_channel')
            ->get()
            ->keyBy('commission_channel');

        $methodRows = (clone $base)
            ->select('payments.method', 'payments.commission_channel')
            ->selectRaw('ROUND(COALESCE(SUM(' . $payLaar . '), 0) / 100.0, 2) as gross')
            ->selectRaw('ROUND(COALESCE(SUM(payments.commission_laar), 0) / 100.0, 2) as commission')
            ->groupBy('payments.method', 'payments.commission_channel')
            ->orderBy('payments.method')
            ->get();

        $byChannel = [];
        foreach ([self::CHANNEL_POS_CARD, self::CHANNEL_ONLINE_GATEWAY] as $channel) {
            $row = $channelRows->get($channel);
            $gross = (float) ($row->gross ?? 0);
            $commission = (float) ($row->commission ?? 0);
            $rateBp = $channel === self::CHANNEL_POS_CARD
                ? $settings['pos_card_rate_bp']
                : $settings['online_gateway_rate_bp'];

            $byChannel[] = [
                'channel' => $channel,
                'label' => $channel === self::CHANNEL_POS_CARD ? 'POS card / QR' : 'Online / BML gateway',
                'gross' => $gross,
                'commission' => $commission,
                'net' => round($gross - $commission, 2),
                'rate_bp' => $rateBp,
                'rate_percent' => round($rateBp / 100, 2),
            ];
        }

        $grossTotal = array_sum(array_column($byChannel, 'gross'));
        $commissionTotal = array_sum(array_column($byChannel, 'commission'));

        return [
            'enabled' => $settings['enabled'],
            'rates' => [
                'pos_card_rate_bp' => $settings['pos_card_rate_bp'],
                'online_gateway_rate_bp' => $settings['online_gateway_rate_bp'],
            ],
            'totals' => [
                'gross_commissionable' => round($grossTotal, 2),
                'commission_total' => round($commissionTotal, 2),
                'net_settlement' => round($grossTotal - $commissionTotal, 2),
            ],
            'by_channel' => $byChannel,
            'by_method' => $methodRows->map(fn ($row) => [
                'method' => (string) $row->method,
                'method_label' => \App\Support\PaymentMethodLabel::for((string) $row->method),
                'channel' => (string) $row->commission_channel,
                'gross' => (float) $row->gross,
                'commission' => (float) $row->commission,
                'net' => round((float) $row->gross - (float) $row->commission, 2),
            ])->values()->all(),
        ];
    }
}
