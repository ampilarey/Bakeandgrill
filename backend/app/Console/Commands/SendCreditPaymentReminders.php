<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Invoice;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class SendCreditPaymentReminders extends Command
{
    protected $signature = 'credit:send-payment-reminders {--date= : Process reminders as of this date (Y-m-d)}';

    protected $description = 'Send SMS reminders for open credit invoices (upcoming, due today, overdue)';

    public function handle(SmsService $sms): int
    {
        $today = $this->option('date')
            ? Carbon::parse((string) $this->option('date'))->startOfDay()
            : now()->startOfDay();

        $sent = 0;

        Invoice::query()
            ->with(['customer:id,name,phone,credit_enabled,credit_reminder_sms'])
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereNotNull('due_date')
            ->whereNotNull('customer_id')
            ->whereRaw('total_laar > amount_paid_laar')
            ->whereHas('customer', function ($q): void {
                $q->where('credit_enabled', true)
                    ->where('credit_reminder_sms', true)
                    ->whereNotNull('phone')
                    ->where('phone', '!=', '');
            })
            ->orderBy('id')
            ->chunkById(100, function ($invoices) use ($sms, $today, &$sent): void {
                foreach ($invoices as $invoice) {
                    $customer = $invoice->customer;
                    if ($customer === null || !$customer->credit_reminder_sms) {
                        continue;
                    }

                    $due = Carbon::parse($invoice->due_date)->startOfDay();
                    $kind = match (true) {
                        $today->equalTo($due->copy()->subDays(3)) => 'upcoming',
                        $today->equalTo($due) => 'due_today',
                        $today->equalTo($due->copy()->addDays(3)) => 'overdue',
                        default => null,
                    };

                    if ($kind === null) {
                        continue;
                    }

                    $balanceMvr = round($invoice->balanceDueLaar() / 100, 2);
                    if ($balanceMvr <= 0) {
                        continue;
                    }

                    $link = rtrim(config('app.url'), '/') . '/invoices/' . $invoice->token;
                    $dueLabel = $due->format('d M Y');

                    $message = match ($kind) {
                        'upcoming' => sprintf(
                            'Bake & Grill: Credit invoice %s - MVR %.2f due on %s. View: %s',
                            $invoice->invoice_number,
                            $balanceMvr,
                            $dueLabel,
                            $link,
                        ),
                        'due_today' => sprintf(
                            'Bake & Grill: Credit payment due today - invoice %s, MVR %.2f. View: %s',
                            $invoice->invoice_number,
                            $balanceMvr,
                            $link,
                        ),
                        'overdue' => sprintf(
                            'Bake & Grill: Credit invoice %s is overdue (MVR %.2f, due %s). View: %s',
                            $invoice->invoice_number,
                            $balanceMvr,
                            $dueLabel,
                            $link,
                        ),
                    };

                    $idempotencyKey = sprintf(
                        'credit:reminder:%d:%s:%s',
                        $invoice->id,
                        $kind,
                        $today->toDateString(),
                    );

                    $sms->send(new SmsMessage(
                        to: (string) $customer->phone,
                        message: $message,
                        type: 'transactional',
                        customerId: $customer->id,
                        referenceType: 'invoice',
                        referenceId: (string) $invoice->id,
                        idempotencyKey: $idempotencyKey,
                    ));

                    $sent++;
                }
            });

        $this->info("Sent {$sent} credit payment reminder(s) for {$today->toDateString()}.");

        return 0;
    }
}
