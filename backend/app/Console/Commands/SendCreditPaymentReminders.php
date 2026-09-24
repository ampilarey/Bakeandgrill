<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\CustomerSmsMessageBuilder;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Invoice;
use App\Models\SiteSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Credit invoice reminders: three days before, on the day, three days
 * after, and then every N days while unpaid (wholesale audit, 2026-09-26;
 * the old version stopped at day three and also skipped any customer
 * whose credit had been blocked, which is when the money is most at risk).
 * The customer's own reminder switch still applies. Texts are templates.
 */
class SendCreditPaymentReminders extends Command
{
    public const SETTING_EVERY_DAYS = 'credit_overdue_reminder_every_days';

    public const DEFAULT_EVERY_DAYS = 7;

    protected $signature = 'credit:send-payment-reminders {--date= : Process reminders as of this date (Y-m-d)}';

    protected $description = 'Send SMS reminders for open credit invoices (upcoming, due today, overdue and repeating)';

    public static function everyDays(): int
    {
        $raw = (int) SiteSetting::get(self::SETTING_EVERY_DAYS, (string) self::DEFAULT_EVERY_DAYS);

        return max(0, min(90, $raw));
    }

    public function handle(SmsService $sms, CustomerSmsMessageBuilder $builder): int
    {
        $today = $this->option('date')
            ? Carbon::parse((string) $this->option('date'))->startOfDay()
            : now()->startOfDay();
        $every = self::everyDays();

        $sent = 0;

        Invoice::query()
            ->with(['customer:id,name,phone,credit_enabled,credit_reminder_sms'])
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereNotNull('due_date')
            ->whereNotNull('customer_id')
            ->whereRaw(Invoice::OPEN_BALANCE_SQL)
            ->whereHas('customer', function ($q): void {
                $q->where('credit_reminder_sms', true)
                    ->whereNotNull('phone')
                    ->where('phone', '!=', '');
            })
            ->orderBy('id')
            ->chunkById(100, function ($invoices) use ($sms, $builder, $today, $every, &$sent): void {
                foreach ($invoices as $invoice) {
                    $customer = $invoice->customer;
                    if ($customer === null || !$customer->credit_reminder_sms) {
                        continue;
                    }
                    // Credit is no longer required to be *enabled* — a blocked
                    // account still owes — but a plain sale invoice with a due
                    // date on a customer who never had credit is not chased.
                    if (!$customer->credit_enabled && !$invoice->isOnCreditAccount() && $invoice->trade_account_id === null) {
                        continue;
                    }

                    $due = Carbon::parse($invoice->due_date)->startOfDay();
                    $daysOverdue = $due->lt($today) ? (int) $due->diffInDays($today) : 0;
                    $kind = match (true) {
                        $today->equalTo($due->copy()->subDays(3)) => 'upcoming',
                        $today->equalTo($due) => 'due_today',
                        $daysOverdue === 3 => 'overdue',
                        $daysOverdue > 3 && $every > 0 && $daysOverdue % $every === 0 => 'overdue',
                        default => null,
                    };

                    if ($kind === null) {
                        continue;
                    }

                    $balanceLaar = $invoice->balanceDueLaar();
                    if ($balanceLaar <= 0) {
                        continue;
                    }

                    $vars = [
                        'invoice_number' => (string) $invoice->invoice_number,
                        'amount' => number_format($balanceLaar / 100, 2, '.', ''),
                        'due_date' => $due->format('d M Y'),
                        'days_overdue' => (string) $daysOverdue,
                        'link' => rtrim((string) config('app.url'), '/') . '/invoices/' . $invoice->token,
                    ];

                    [$slug, $fallback] = match ($kind) {
                        'upcoming' => ['credit_reminder_upcoming', 'Bake & Grill: Credit invoice {{invoice_number}} - MVR {{amount}} due on {{due_date}}. View: {{link}}'],
                        'due_today' => ['credit_reminder_due_today', 'Bake & Grill: Credit payment due today - invoice {{invoice_number}}, MVR {{amount}}. View: {{link}}'],
                        'overdue' => ['credit_reminder_overdue', 'Bake & Grill: Credit invoice {{invoice_number}} is {{days_overdue}} days overdue (MVR {{amount}}, due {{due_date}}). View: {{link}}'],
                    };

                    $sms->send(new SmsMessage(
                        to: (string) $customer->phone,
                        message: $builder->build($slug, $vars, $fallback),
                        type: 'credit_payment_reminder',
                        customerId: $customer->id,
                        referenceType: 'invoice',
                        referenceId: (string) $invoice->id,
                        idempotencyKey: sprintf('credit:reminder:%d:%s:%s', $invoice->id, $kind, $today->toDateString()),
                    ));

                    $sent++;
                }
            });

        $this->info("Sent {$sent} credit payment reminder(s) for {$today->toDateString()}.");

        return 0;
    }
}
