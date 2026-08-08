<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Models\Refund;
use App\Models\Role;
use App\Models\SmsTemplate;
use App\Models\User;
use App\Models\SiteSetting;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Owner daily deterrent: who requested/approved, phone numbers, flags, OTP overrides.
 */
class SendDailyRefundSummaryCommand extends Command
{
    protected $signature = 'refunds:send-daily-summary {--date=}';

    protected $description = 'SMS the owner a summary of yesterday\'s refund activity';

    public function handle(SmsService $sms, RefundWorkflowService $workflow): int
    {
        if (SiteSetting::get('sms_owner_daily_refund_summary_enabled', '1') === '0') {
            $this->info('Daily refund summary SMS disabled.');

            return self::SUCCESS;
        }

        $day = $this->option('date')
            ? Carbon::parse((string) $this->option('date'), config('app.timezone'))->startOfDay()
            : Carbon::now(config('app.timezone'))->subDay()->startOfDay();
        $end = $day->copy()->endOfDay();

        $refunds = Refund::query()
            ->with(['user', 'approver', 'order.customer'])
            ->whereBetween('created_at', [$day, $end])
            ->whereIn('status', ['pending', 'approved', 'rejected', 'processed'])
            ->orderBy('id')
            ->get();

        $count = $refunds->count();
        $approved = $refunds->whereIn('status', ['approved', 'processed']);
        $total = (float) $approved->sum('amount');
        $phoneAdded = $refunds->where('phone_added_at_refund', true)->count();
        $overrides = $refunds->where('otp_owner_override', true)->count();

        $lines = [
            sprintf(
                'Refunds %s: %d totaling MVR %s. Phone-added: %d. OTP overrides: %d.',
                $day->toDateString(),
                $count,
                number_format($total, 2),
                $phoneAdded,
                $overrides,
            ),
        ];
        foreach ($refunds->take(12) as $r) {
            $flags = $workflow->phoneFlags($r);
            $req = $r->user?->name ?? '—';
            $apr = $r->approver?->name ?? ($r->status === 'pending' ? 'pending' : '—');
            $flagBits = [];
            if ($flags['phone_added_at_refund']) {
                $flagBits[] = 'ADDED';
            }
            if (! $flags['has_prior_order_history']) {
                $flagBits[] = 'NO-HISTORY';
            }
            if ($flags['refunds_last_90_days'] > 0) {
                $flagBits[] = 'RPT'.$flags['refunds_last_90_days'];
            }
            if ($flags['otp_owner_override']) {
                $flagBits[] = 'OTP-OVERRIDE';
            }
            $flag = $flagBits !== [] ? ' ['.implode(',', $flagBits).']' : '';
            $lines[] = sprintf(
                '#%d %s MVR %s phone:%s req:%s appr:%s%s',
                $r->id,
                $r->status,
                number_format((float) $r->amount, 2),
                $flags['refund_phone'] ?? '—',
                $req,
                $apr,
                $flag,
            );
        }

        $detail = implode("\n", $lines);

        $template = SmsTemplate::query()->where('slug', 'owner_daily_refund_summary')->first();
        $smsBody = $template?->body
            ?: 'Refunds yesterday: {{count}} totaling MVR {{total}}. Phone-added: {{phone_added_count}}. OTP overrides: {{otp_override_count}}. Details in admin Refunds.';
        $smsBody = str_replace(
            ['{{count}}', '{{total}}', '{{phone_added_count}}', '{{otp_override_count}}', '{{no_contact_count}}'],
            [(string) $count, number_format($total, 2), (string) $phoneAdded, (string) $overrides, (string) $phoneAdded],
            $smsBody,
        );

        $ownerRole = Role::query()->where('slug', 'owner')->first();
        $owners = $ownerRole
            ? User::query()->where('role_id', $ownerRole->id)->where('is_active', true)->get()
            : collect();

        $sent = 0;
        foreach ($owners as $owner) {
            $phone = trim((string) ($owner->phone ?? ''));
            if ($phone === '') {
                continue;
            }
            $sms->send(new SmsMessage(
                to: $phone,
                message: $smsBody,
                type: 'owner_daily_refund_summary',
                referenceType: 'refund_daily_summary',
                referenceId: $day->toDateString(),
                idempotencyKey: 'refund-daily:'.$day->toDateString().':'.$owner->id,
            ));
            $sent++;
        }

        $this->info($detail);
        $this->info("SMS sent to {$sent} owner(s).");

        return self::SUCCESS;
    }
}
