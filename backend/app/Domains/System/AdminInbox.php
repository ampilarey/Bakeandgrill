<?php

declare(strict_types=1);

namespace App\Domains\System;

use App\Domains\Labels\ExpiringPrints;
use App\Domains\Labels\LabelRolls;
use App\Models\BankStatementLine;
use App\Models\Complaint;
use App\Models\ItemQuestion;
use App\Models\Order;
use App\Models\OrderMessage;
use App\Models\Refund;
use App\Models\Review;
use App\Models\User;
use App\Services\PermissionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * "Needs attention": one list of what wants a person today (iruali import
 * plan, feature 14). Each row has a label, a count, a link, a level and the
 * permission of the page it links to, so nobody sees a row for a page they
 * cannot open. A row that throws is logged and skipped. A domain adds a row
 * with AdminInbox::register().
 */
final class AdminInbox
{
    /** @var array<string, array{label: string, link: string, permission: string, count: \Closure(): int, level?: \Closure(int): string}> */
    private static array $extra = [];

    /** @param array{label: string, link: string, permission: string, count: \Closure(): int, level?: \Closure(int): string} $row */
    public static function register(string $key, array $row): void
    {
        self::$extra[$key] = $row;
    }

    /** @return array<string, array{label: string, link: string, permission: string, count: \Closure(): int, level?: \Closure(int): string}> */
    private static function definitions(): array
    {
        $warn = fn (int $n) => 'warn';

        return [
            'refunds_approval' => [
                'label' => 'Refunds waiting for approval', 'link' => '/finance/refunds', 'permission' => 'orders.refund',
                'count' => fn () => Refund::query()->where('status', 'pending')->count(), 'level' => $warn,
            ],
            'refunds_payout' => [
                'label' => 'Refunds to pay out by card, bank or store credit', 'link' => '/finance/refunds?owed=1', 'permission' => 'orders.refund',
                'count' => fn () => Refund::query()->whereIn('status', ['approved', 'processed'])->where('external_tender_laar', '>', 0)->whereNull('paid_out_at')->count(),
                'level' => $warn,
            ],
            'complaints_open' => [
                'label' => 'Complaints not answered', 'link' => '/customers/complaints', 'permission' => 'complaints.view',
                'count' => fn () => Complaint::query()->where('status', Complaint::STATUS_NEW)->count(),
                'level' => fn (int $n) => Complaint::query()->where('status', Complaint::STATUS_NEW)->where('created_at', '<', now()->subDay())->exists() ? 'danger' : 'warn',
            ],
            'bank_lines' => [
                'label' => 'Bank lines to match', 'link' => '/finance/settlements', 'permission' => 'finance.settlements',
                'count' => fn () => BankStatementLine::query()->where('match_status', BankStatementLine::MATCH_UNMATCHED)->count(),
            ],
            'reviews' => [
                'label' => 'Reviews waiting for moderation', 'link' => '/customers/reviews', 'permission' => 'customers.manage',
                'count' => fn () => Review::query()->where('status', 'pending')->count(),
            ],
            'questions' => [
                'label' => 'Dish questions not answered', 'link' => '/customers/questions', 'permission' => 'customers.manage',
                'count' => fn () => ItemQuestion::query()->where('status', ItemQuestion::PENDING)->count(),
            ],
            'order_messages' => [
                'label' => 'Customer messages about orders', 'link' => '/orders', 'permission' => 'orders.view',
                'count' => function (): int {
                    $latest = OrderMessage::query()->selectRaw('MAX(id) as id')->groupBy('order_id');

                    return OrderMessage::query()->whereIn('id', $latest)->where('sender', OrderMessage::CUSTOMER)->count();
                },
                'level' => $warn,
            ],
            'orders_unaccepted' => [
                'label' => 'Online orders paid but not started', 'link' => '/orders', 'permission' => 'orders.view',
                'count' => fn () => Order::query()->whereIn('type', ['online_pickup', 'delivery'])->where('payment_status', 'paid')
                    ->where('status', 'pending')->where('paid_at', '<', now()->subMinutes(10))->count(),
                'level' => fn (int $n) => 'danger',
            ],
            'failed_jobs' => [
                'label' => 'Background jobs that failed', 'link' => '/system-health', 'permission' => 'website.manage',
                'count' => fn () => (int) DB::table('failed_jobs')->count(),
                'level' => $warn,
            ],
            'label_rolls' => [
                'label' => 'Label rolls running low', 'link' => '/labels/settings', 'permission' => 'labels.manage',
                'count' => fn () => count(array_filter(LabelRolls::presentAll(), fn (array $r) => !empty($r['low_now']))),
            ],
            // A fingerprint clock that called and is not allowed yet, or a number on a clock
            // that belongs to nobody (its punches wait off the time clock).
            'clock_machine' => [
                'label' => 'Clock machine: waiting clocks and numbers nobody has', 'link' => '/time-clock?tab=machine', 'permission' => 'staff.update',
                'count' => fn () => \App\Models\ClockDevice::query()->whereNull('allowed_at')->count()
                    + (int) \App\Models\ClockDevicePunch::query()->whereNull('user_id')->where('punched_at', '>=', now()->subDays(14))->distinct()->count('device_user_no'),
                'level' => $warn,
            ],
            // Only an owner can erase (AdminCustomerController::erase); settings.manage is
            // owner-only by default, so the row reaches the people who can act on it.
            'erasure_requests' => [
                'label' => 'Customers asking to be erased', 'link' => '/customers?erasure=1', 'permission' => 'settings.manage',
                'count' => fn () => \App\Models\CustomerErasureRequest::query()->where('status', 'pending')->count(),
                'level' => fn (int $n) => \App\Models\CustomerErasureRequest::query()->where('status', 'pending')->where('requested_at', '<', now()->subDays(7))->exists() ? 'danger' : 'warn',
            ],
            'expiring_stock' => [
                'label' => 'Packed stock near its use-by', 'link' => '/labels/stickers', 'permission' => 'labels.print',
                'count' => fn () => count(ExpiringPrints::groups(2)),
                'level' => $warn,
            ],
            // Owner, 2026-10-21 (credit audit): customers whose credit invoices are past due; red once one is a month late.
            'credit_overdue' => [
                'label' => 'Credit accounts with an overdue invoice', 'link' => '/customers/credit', 'permission' => 'customers.credit.manage',
                'count' => fn () => (int) self::overdueCreditInvoices()->distinct()->count('customer_id'),
                'level' => fn (int $n) => self::overdueCreditInvoices()->where('due_date', '<', now()->subDays(30)->toDateString())->exists() ? 'danger' : 'warn',
            ],
        ] + self::$extra;
    }

    /** Customer (not wholesale) credit invoices past their due date with a balance. */
    private static function overdueCreditInvoices(): \Illuminate\Database\Eloquent\Builder
    {
        return \App\Models\Invoice::query()
            ->whereNotNull('customer_id')
            ->whereNull('trade_account_id')
            ->where('type', 'sale')
            ->whereIn('status', ['sent', 'overdue'])
            ->whereNotNull('due_date')
            ->where('due_date', '<', now()->toDateString())
            ->whereRaw(\App\Models\Invoice::OPEN_BALANCE_SQL);
    }

    /**
     * The rows this person may open that have something waiting, most urgent first.
     *
     * @return list<array{key: string, label: string, count: int, link: string, level: string}>
     */
    public static function rowsFor(User $user): array
    {
        $perms = app(PermissionService::class);
        $rows = [];
        foreach (self::definitions() as $key => $def) {
            try {
                if (!$perms->hasPermission($user, $def['permission'])) {
                    continue;
                }
                $count = (int) ($def['count'])();
                if ($count <= 0) {
                    continue;
                }
                $level = isset($def['level']) ? ($def['level'])($count) : 'info';
                $rows[] = ['key' => $key, 'label' => $def['label'], 'count' => $count, 'link' => $def['link'], 'level' => $level];
            } catch (\Throwable $e) {
                Log::warning('Needs attention: a row could not be counted', ['row' => $key, 'error' => $e->getMessage()]);
            }
        }
        $rank = ['danger' => 0, 'warn' => 1, 'info' => 2];
        usort($rows, fn ($a, $b) => [$rank[$a['level']] ?? 3, -$a['count']] <=> [$rank[$b['level']] ?? 3, -$b['count']]);

        return $rows;
    }
}
