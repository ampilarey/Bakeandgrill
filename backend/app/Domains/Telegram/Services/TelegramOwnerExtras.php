<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Complaints\Services\ComplaintBoxService;
use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Orders\Services\DiscountApprovalService;
use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Domains\System\Services\ServiceAvailabilityService;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\AuditLog;
use App\Models\ComplaintBoxEntry;
use App\Models\Customer;
use App\Models\CustomerDepositAccount;
use App\Models\DiscountApproval;
use App\Models\LoyaltyAccount;
use App\Models\Order;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\TelegramLink;
use App\Models\User;
use App\Services\OpeningHoursService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/**
 * Owner bot, step 2 (owner, 2026-10-07: "Up to u" on the list of what
 * else the bot could do). Week and month, sales by cashier, the shop's
 * switches (online orders, delivery, closed days), refunds still owed,
 * the complaint box with replies, customer lookup, and discount approval
 * by button. As in step 1, every command and button checks the person's
 * own permissions when it runs.
 */
class TelegramOwnerExtras
{
    /** Keys "Pause online orders" switches, the same as Admin's preset. */
    private const ONLINE_KEYS = ['online_ordering', 'online_pickup', 'online_delivery', 'online_checkout'];

    public function __construct(
        private readonly TelegramClient $client,
        private readonly PermissionService $permissions,
    ) {}

    private function c(): TelegramCommands
    {
        return app(TelegramCommands::class);
    }

    private function can(User $user, string $permission): bool
    {
        return $this->permissions->hasPermission($user, $permission);
    }

    /** @return list<string> */
    public function menuButtons(User $user): array
    {
        $b = [];
        if ($this->can($user, 'reports.view')) {
            $b[] = TelegramCommands::BTN_WEEK;
            $b[] = TelegramCommands::BTN_CASHIERS;
        }
        if ($this->canShop($user)) {
            $b[] = TelegramCommands::BTN_SHOP;
        }
        if ($this->can($user, 'orders.refund')) {
            $b[] = TelegramCommands::BTN_OWED;
        }
        if ($this->can($user, 'complaints.manage')) {
            $b[] = TelegramCommands::BTN_COMPLAINTS;
        }
        if ($this->canCustomers($user)) {
            $b[] = TelegramCommands::BTN_CUSTOMER;
        }

        return $b;
    }

    public function handleText(TelegramLink $link, User $user, string $raw, ?string $command): bool
    {
        $arg = trim((string) preg_replace('/^\/\S+\s*/u', '', $raw));

        if ($raw === TelegramCommands::BTN_WEEK || $command === 'week') {
            $this->period($link, $user, 'week');

            return true;
        }
        if ($command === 'month') {
            $this->period($link, $user, 'month');

            return true;
        }
        if ($raw === TelegramCommands::BTN_CASHIERS || $command === 'cashiers') {
            $this->cashiers($link, $user);

            return true;
        }
        if ($raw === TelegramCommands::BTN_SHOP || $command === 'shop') {
            $this->shop($link, $user);

            return true;
        }
        if ($raw === TelegramCommands::BTN_OWED || $command === 'owed') {
            $this->refundsOwed($link, $user);

            return true;
        }
        if ($raw === TelegramCommands::BTN_COMPLAINTS || $command === 'complaints') {
            $this->complaints($link, $user);

            return true;
        }
        if ($raw === TelegramCommands::BTN_CUSTOMER || $command === 'customer') {
            if ($command === 'customer' && $arg !== '') {
                $this->customerSearch($link, $user, $arg);
            } elseif (!$this->canCustomers($user)) {
                $this->c()->refuse($link);
            } else {
                $this->c()->awaitReply($link, ['action' => 'customer_search']);
                $this->c()->send($link, '🔎 Type a phone number or a name.');
            }

            return true;
        }

        return false;
    }

    public function handleCallback(TelegramLink $link, User $user, string $callbackId, int $messageId, string $action, string $arg): bool
    {
        $answer = fn (string $text = '', bool $alert = false) => $this->client->answerCallback($link->bot, $callbackId, $text, $alert);

        switch ($action) {
            case 'pd':
                $answer();
                $this->period($link, $user, $arg);

                return true;
            case 'sh':
                $this->shopAction($link, $user, $messageId, $arg, $answer);

                return true;
            case 'po':
                $this->paidOutTap($link, $user, $messageId, $arg, $answer);

                return true;
            case 'cb':
                $this->complaintTap($link, $user, $messageId, $arg, $answer);

                return true;
            case 'cu':
                $answer();
                $this->customerCard($link, $user, (int) $arg);

                return true;
            case 'da':
            case 'dd':
                $this->discountTap($link, $user, $messageId, (int) $arg, $action === 'da', $answer);

                return true;
        }

        return false;
    }

    /** @param array<string, mixed> $await */
    public function answerAwait(TelegramLink $link, User $user, array $await, string $text): bool
    {
        return match ($await['action'] ?? '') {
            'customer_search' => $this->customerSearch($link, $user, $text) ?? true,
            'paid_out_ref' => $this->finishPaidOut($link, $user, $await, $text),
            'complaint_reply' => $this->finishComplaintReply($link, $user, $await, $text),
            default => false,
        };
    }

    // ── Week and month ───────────────────────────────────────────────────

    public function period(TelegramLink $link, User $user, string $which): void
    {
        if (!$this->can($user, 'reports.view')) {
            $this->c()->refuse($link);

            return;
        }

        $now = now();
        [$title, $from, $to, $prevFrom, $prevTo, $vsLabel] = match ($which) {
            'lastweek' => ['Last week', $now->copy()->subWeek()->startOfWeek(), $now->copy()->subWeek()->endOfWeek(), $now->copy()->subWeeks(2)->startOfWeek(), $now->copy()->subWeeks(2)->endOfWeek(), 'the week before'],
            'month' => ['This month', $now->copy()->startOfMonth(), $now->copy(), $now->copy()->subMonthNoOverflow()->startOfMonth(), $now->copy()->subMonthNoOverflow(), 'the same days last month'],
            'lastmonth' => ['Last month', $now->copy()->subMonthNoOverflow()->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth(), $now->copy()->subMonthsNoOverflow(2)->startOfMonth(), $now->copy()->subMonthsNoOverflow(2)->endOfMonth(), 'the month before'],
            default => ['This week', $now->copy()->startOfWeek(), $now->copy(), $now->copy()->subWeek()->startOfWeek(), $now->copy()->subWeek(), 'the same days last week'],
        };

        $cur = $this->totals($from, $to);
        $prev = $this->totals($prevFrom, $prevTo);
        $days = $this->byDay($from, $to);

        $lines = ['📈 <b>' . $title . '</b> · ' . $from->format('D j M') . ' – ' . $to->format('D j M')];
        $lines[] = '';
        $lines[] = '<b>Sales</b> ' . T::mvr($cur['revenue']) . $this->change($cur['revenue'], $prev['revenue'], $vsLabel);
        $lines[] = '<b>Orders</b> ' . $cur['orders'] . ' · average ' . T::mvr($cur['orders'] > 0 ? $cur['revenue'] / $cur['orders'] : 0);
        if ($days !== []) {
            $lines[] = '<b>Per day</b> ' . T::mvr($cur['revenue'] / max(1, count($days)));
        }
        if ($cur['refunds'] > 0) {
            $lines[] = '<b>Refunds</b> ' . T::mvr($cur['refunds']);
        }
        if (count($days) >= 2) {
            arsort($days);
            $best = array_key_first($days);
            $worst = array_key_last($days);
            $lines[] = '';
            $lines[] = '<b>Best day</b> ' . Carbon::parse($best)->format('D j M') . ' · ' . T::mvr($days[$best]);
            $lines[] = '<b>Quietest day</b> ' . Carbon::parse($worst)->format('D j M') . ' · ' . T::mvr($days[$worst]);
        }

        $top = $this->topItems($from, $to);
        if ($top !== []) {
            $lines[] = '';
            $lines[] = '<b>Best sellers</b>';
            foreach ($top as $i => $r) {
                $lines[] = ($i + 1) . '. ' . T::e($r['name']) . ' × ' . $r['qty'];
            }
        }

        $buttons = [array_values(array_filter([
            $which !== 'week' ? T::button('This week', 'pd:week') : null,
            $which !== 'lastweek' ? T::button('Last week', 'pd:lastweek') : null,
        ])), array_values(array_filter([
            $which !== 'month' ? T::button('This month', 'pd:month') : null,
            $which !== 'lastmonth' ? T::button('Last month', 'pd:lastmonth') : null,
        ]))];

        $this->c()->send($link, implode("\n", $lines), [], $buttons);
    }

    /** @return array{revenue: float, orders: int, refunds: float} */
    private function totals(Carbon $from, Carbon $to): array
    {
        $row = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('COUNT(*) as n')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->first();
        $refunds = (float) Refund::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['approved', 'processed', 'completed'])
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::REFUND_AMOUNT_LAAR) . ' as total')
            ->value('total');

        return ['revenue' => (float) ($row->total ?? 0), 'orders' => (int) ($row->n ?? 0), 'refunds' => $refunds];
    }

    /** @return array<string, float> date => sales */
    private function byDay(Carbon $from, Carbon $to): array
    {
        return Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('DATE(created_at) as d')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->groupBy('d')
            ->pluck('total', 'd')
            ->map(fn ($v) => (float) $v)
            ->all();
    }

    /** @return list<array{name: string, qty: int}> */
    private function topItems(Carbon $from, Carbon $to): array
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->join('items', 'items.id', '=', 'order_items.item_id')
            ->whereNull('orders.deleted_at')
            ->whereBetween('orders.created_at', [$from, $to])
            ->whereIn('orders.status', ReportMoneySql::SALE_STATUSES)
            ->selectRaw('items.name as name, SUM(order_items.quantity) as qty')
            ->groupBy('items.id', 'items.name')
            ->orderByDesc('qty')
            ->limit(5)
            ->get()
            ->map(fn ($r) => ['name' => (string) $r->name, 'qty' => (int) round((float) $r->qty)])
            ->all();
    }

    private function change(float $now, float $before, string $label): string
    {
        if ($before <= 0) {
            return '';
        }
        $pct = (int) round(($now - $before) / $before * 100);

        return "\n<i>" . ($pct >= 0 ? '▲ ' : '▼ ') . abs($pct) . '% on ' . $label . ' (' . T::mvr($before) . ')</i>';
    }

    // ── Cashiers ─────────────────────────────────────────────────────────

    public function cashiers(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'reports.view')) {
            $this->c()->refuse($link);

            return;
        }

        $from = now()->startOfDay();
        $to = now();
        $rows = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ReportMoneySql::SALE_STATUSES)
            ->whereNotNull('user_id')
            ->selectRaw('user_id, COUNT(*) as n')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->selectRaw('COALESCE(SUM(manual_discount_laar), 0) / 100 as discounts')
            ->groupBy('user_id')
            ->orderByDesc('total')
            ->get();
        $refunds = Refund::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['pending', 'approved', 'processed', 'completed'])
            ->selectRaw('user_id, COUNT(*) as n, COALESCE(SUM(amount), 0) as total')
            ->groupBy('user_id')
            ->get()
            ->keyBy('user_id');
        $open = Shift::query()->whereNull('closed_at')->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        $names = User::query()->whereIn('id', $rows->pluck('user_id')->merge($refunds->keys())->merge($open)->unique())->pluck('name', 'id');

        if ($rows->isEmpty() && $refunds->isEmpty()) {
            $this->c()->send($link, '👥 <b>No sales yet today.</b>');

            return;
        }

        $lines = ['👥 <b>By cashier</b> · today'];
        foreach ($rows as $r) {
            $id = (int) $r->user_id;
            $lines[] = '';
            $lines[] = '<b>' . T::e((string) ($names[$id] ?? 'Staff #' . $id)) . '</b>' . (in_array($id, $open, true) ? ' · on shift' : '');
            $lines[] = T::mvr($r->total) . ' · ' . (int) $r->n . ' ' . ((int) $r->n === 1 ? 'order' : 'orders') . ' · average ' . T::mvr((float) $r->total / max(1, (int) $r->n));
            if ((float) $r->discounts > 0) {
                $lines[] = 'Discounts given ' . T::mvr($r->discounts);
            }
            if (isset($refunds[$id])) {
                $lines[] = 'Refunds asked ' . (int) $refunds[$id]->n . ' · ' . T::mvr($refunds[$id]->total);
            }
        }
        foreach ($refunds as $id => $ref) {
            if (!$rows->contains('user_id', $id)) {
                $lines[] = '';
                $lines[] = '<b>' . T::e((string) ($names[$id] ?? 'Staff #' . $id)) . '</b>';
                $lines[] = 'Refunds asked ' . (int) $ref->n . ' · ' . T::mvr($ref->total);
            }
        }

        $this->c()->send($link, T::clip(implode("\n", $lines)));
    }

    // ── End-of-day report ────────────────────────────────────────────────

    /** The report sent when the last shift of the day closes. */
    public function endOfDayHtml(): string
    {
        $lines = $this->c()->dayReportLines(now());
        $lines[0] = '🌙 <b>Day closed</b> · ' . now()->format('D j M Y');

        $shifts = Shift::query()->whereDate('closed_at', now()->toDateString())->with('user:id,name')->orderBy('closed_at')->get();
        if ($shifts->isNotEmpty()) {
            $lines[] = '';
            $lines[] = '<b>Shifts closed today</b>';
            foreach ($shifts as $s) {
                $v = (float) ($s->variance ?? 0);
                $drawer = abs($v) < 0.005 ? 'drawer matched' : ('drawer ' . ($v < 0 ? 'short ' : 'over ') . T::mvr(abs($v)));
                $lines[] = '• ' . T::e($s->user?->name ?? 'Staff') . ', ' . $s->closed_at->format('g:i a') . ': ' . $drawer;
            }
        }

        $owed = Refund::query()->owedExternally()->count();
        if ($owed > 0) {
            $lines[] = '';
            $lines[] = '💸 ' . $owed . ' ' . ($owed === 1 ? 'refund is' : 'refunds are') . ' still to be paid back. Tap ' . TelegramCommands::BTN_OWED . '.';
        }

        return T::clip(implode("\n", $lines));
    }

    // ── Shop switches ────────────────────────────────────────────────────

    private function canShop(User $user): bool
    {
        return $this->can($user, 'service_availability.manage_public') || $this->can($user, 'settings.update');
    }

    public function shop(TelegramLink $link, User $user, ?int $editMessageId = null): void
    {
        if (!$this->canShop($user)) {
            $this->c()->refuse($link);

            return;
        }
        [$html, $buttons] = $this->shopCard($user);
        if ($editMessageId !== null) {
            $this->client->editMessage($link->bot, $link->chat_id, $editMessageId, $html, $buttons);
        } else {
            $this->c()->send($link, $html, [], $buttons);
        }
    }

    /** @return array{0: string, 1: array<int, array<int, array<string, string>>>} */
    private function shopCard(User $user): array
    {
        $rows = app(ServiceAvailabilityService::class)->rows();
        $snapshot = app(ServiceAvailabilityService::class)->resolve();
        $onlinePaused = ($rows['online_ordering']->status ?? 'available') !== 'available';
        $deliveryPaused = ($rows['online_delivery']->status ?? 'available') !== 'available';

        $state = function (bool $paused, string $key) use ($rows, $snapshot): string {
            if ($paused) {
                $by = $rows[$key]->changed_by ?? null;
                $who = $by ? User::query()->whereKey($by)->value('name') : null;

                return '⏸ Paused' . ($who ? ' by ' . T::e($who) : '') . (isset($rows[$key]->updated_at) ? ', ' . $rows[$key]->updated_at->format('g:i a') : '');
            }

            return ($snapshot[$key]['available'] ?? true) ? '✅ Taking orders' : '🌙 Closed by the schedule';
        };

        $closures = $this->closures();
        $today = now()->toDateString();
        $tomorrow = now()->addDay()->toDateString();
        $hours = app(OpeningHoursService::class)->getHoursForDisplay();
        $dayLine = function (Carbon $d) use ($closures, $hours): string {
            if (isset($closures[$d->toDateString()])) {
                return '🔒 Closed (' . T::e((string) $closures[$d->toDateString()]) . ')';
            }
            $h = $hours[$d->dayOfWeek] ?? null;
            if (!is_array($h) || ($h['closed'] ?? false)) {
                return 'Closed (weekly hours)';
            }

            return 'Open ' . Carbon::parse($h['open'])->format('g:i a') . ' – ' . Carbon::parse($h['close'])->format('g:i a');
        };

        $lines = [
            '🏪 <b>Shop</b> · ' . now()->format('D j M, g:i a'),
            '',
            '<b>Online orders</b> ' . $state($onlinePaused, 'online_ordering'),
            '<b>Delivery</b> ' . $state($deliveryPaused, 'online_delivery'),
            '',
            '<b>Today</b> ' . $dayLine(now()),
            '<b>Tomorrow</b> ' . $dayLine(now()->addDay()),
        ];

        $buttons = [];
        if ($this->can($user, 'service_availability.manage_public')) {
            $buttons[] = [
                $onlinePaused ? T::button('▶ Resume online orders', 'sh:oo') : T::button('⏸ Pause online orders', 'sh:op'),
            ];
            $buttons[] = [
                $deliveryPaused ? T::button('▶ Resume delivery', 'sh:do') : T::button('⏸ Pause delivery', 'sh:dp'),
            ];
        }
        if ($this->can($user, 'settings.update')) {
            $buttons[] = [
                isset($closures[$today]) ? T::button('🔓 Open today', 'sh:ot') : T::button('🔒 Closed today', 'sh:ct'),
                isset($closures[$tomorrow]) ? T::button('🔓 Open tomorrow', 'sh:om') : T::button('🔒 Closed tomorrow', 'sh:cm'),
            ];
        }

        return [implode("\n", $lines), $buttons];
    }

    private function shopAction(TelegramLink $link, User $user, int $messageId, string $arg, \Closure $answer): void
    {
        $request = $this->c()->requestAs($user);
        $availability = app(ServiceAvailabilityService::class);
        $pauseOnline = function (string $note) use ($availability, $user, $request): void {
            foreach (self::ONLINE_KEYS as $key) {
                $availability->setState($key, ['status' => 'operational_pause', 'reason_type' => 'operational_pause', 'internal_note' => $note], $user, $request);
            }
        };
        $resumeOnline = function () use ($availability, $user, $request): void {
            foreach (self::ONLINE_KEYS as $key) {
                $availability->setState($key, ['status' => 'available', 'reason_type' => null], $user, $request);
            }
        };

        $needsService = in_array($arg, ['op', 'oo', 'dp', 'do'], true);
        if (($needsService && !$this->can($user, 'service_availability.manage_public')) || (!$needsService && !$this->can($user, 'settings.update'))) {
            $answer('Your account cannot change that.', true);

            return;
        }

        $done = match ($arg) {
            'op' => (function () use ($pauseOnline) { $pauseOnline('Paused from Telegram'); return 'Online orders paused.'; })(),
            'oo' => (function () use ($resumeOnline) { $resumeOnline(); return 'Online orders back on.'; })(),
            'dp' => (function () use ($availability, $user, $request) { $availability->setState('online_delivery', ['status' => 'operational_pause', 'reason_type' => 'operational_pause', 'internal_note' => 'Paused from Telegram'], $user, $request); return 'Delivery paused.'; })(),
            'do' => (function () use ($availability, $user, $request) { $availability->setState('online_delivery', ['status' => 'available', 'reason_type' => null], $user, $request); return 'Delivery back on.'; })(),
            // A closed day also stops online orders, and opening again starts them.
            'ct' => (function () use ($user, $pauseOnline) { $this->setClosure(now(), 'Closed today', $user); $pauseOnline('Closed today (Telegram)'); return 'Closed today. Online orders paused.'; })(),
            'ot' => (function () use ($user, $resumeOnline) { $this->setClosure(now(), null, $user); $resumeOnline(); return 'Open today. Online orders back on.'; })(),
            'cm' => (function () use ($user) { $this->setClosure(now()->addDay(), 'Closed', $user); return 'Closed tomorrow.'; })(),
            'om' => (function () use ($user) { $this->setClosure(now()->addDay(), null, $user); return 'Open tomorrow.'; })(),
            default => null,
        };
        if ($done === null) {
            $answer('This button is no longer used.');

            return;
        }

        $answer($done);
        $this->shop($link, $user, $messageId);
    }

    /** @return array<string, string> */
    private function closures(): array
    {
        return app(OpeningHoursService::class)->closures();
    }

    /**
     * Add or remove a whole-day closure, the same list Admin edits. The
     * website, the order app and the hours auto-post (and its TV notice)
     * read it from there.
     */
    private function setClosure(Carbon $day, ?string $reason, User $user): void
    {
        $closures = $this->closures();
        $date = $day->toDateString();
        $before = $closures[$date] ?? null;
        if ($reason === null) {
            unset($closures[$date]);
        } else {
            $closures[$date] = $reason;
        }
        ksort($closures);
        SiteSetting::set('business_closures_json', $closures === [] ? '{}' : (string) json_encode($closures, JSON_UNESCAPED_UNICODE));
        SiteSetting::bust();

        AuditLog::create([
            'user_id' => $user->id,
            'action' => $reason === null ? 'opening_hours.closure_removed' : 'opening_hours.closure_added',
            'model_type' => 'SiteSetting',
            'model_id' => null,
            'old_values' => ['date' => $date, 'reason' => $before],
            'new_values' => ['date' => $date, 'reason' => $reason],
            'meta' => ['via' => 'telegram'],
        ]);
    }

    // ── Refunds owed ─────────────────────────────────────────────────────

    public function refundsOwed(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'orders.refund')) {
            $this->c()->refuse($link);

            return;
        }

        $refunds = Refund::query()->owedExternally()->with('order:id,order_number')->orderBy('approved_at')->limit(10)->get();
        if ($refunds->isEmpty()) {
            $this->c()->send($link, '💸 <b>Nothing to pay back.</b> Every approved refund has been paid out.');

            return;
        }

        $total = (float) Refund::query()->owedExternally()->sum('external_tender_laar') / 100;
        $this->c()->send($link, '💸 <b>Refunds to pay back</b> · ' . Refund::query()->owedExternally()->count() . ' · ' . T::mvr($total));
        foreach ($refunds as $refund) {
            [$html, $buttons] = $this->owedCard($refund);
            $this->c()->send($link, $html, [], $buttons);
        }
    }

    /** @return array{0: string, 1: array<int, array<int, array<string, string>>>} */
    private function owedCard(Refund $refund, ?string $note = null): array
    {
        $lines = [
            '💸 <b>' . T::mvr(((int) $refund->external_tender_laar) / 100) . '</b> to pay back · order #' . T::e((string) ($refund->order?->order_number ?? $refund->order_id)),
            'Approved ' . ($refund->approved_at ? $refund->approved_at->format('D j M') . ' (' . T::agoPhrase($refund->approved_at) . ')' : ''),
        ];
        if ($refund->refund_phone) {
            $lines[] = 'Customer ' . T::e((string) $refund->refund_phone);
        }
        if (trim((string) $refund->reason) !== '') {
            $lines[] = 'Reason: ' . T::e((string) $refund->reason);
        }
        if ($note !== null) {
            $lines[] = '';
            $lines[] = $note;

            return [implode("\n", $lines), []];
        }

        return [implode("\n", $lines), [[
            T::button('🏦 Bank transfer', 'po:' . $refund->id . ':bank_transfer'),
            T::button('💳 Card', 'po:' . $refund->id . ':card_terminal'),
            T::button('💵 Cash', 'po:' . $refund->id . ':cash'),
        ]]];
    }

    private function paidOutTap(TelegramLink $link, User $user, int $messageId, string $arg, \Closure $answer): void
    {
        [$id, $method] = array_pad(explode(':', $arg, 2), 2, '');
        $refund = Refund::with('order:id,order_number')->find((int) $id);
        if ($refund === null || !$this->can($user, 'orders.refund') || !in_array($method, ['bank_transfer', 'card_terminal', 'cash'], true)) {
            $answer('You cannot mark this paid out.', true);

            return;
        }
        if (!$refund->isOwedExternally()) {
            $answer('Already paid out.');
            [$html] = $this->owedCard($refund, '✅ Paid out already.');
            $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html);

            return;
        }
        $answer();

        if ($method === 'cash') {
            $this->finishPaidOut($link, $user, ['id' => $refund->id, 'method' => 'cash', 'message_id' => $messageId], '-');

            return;
        }
        $this->c()->awaitReply($link, ['action' => 'paid_out_ref', 'id' => $refund->id, 'method' => $method, 'message_id' => $messageId]);
        $this->c()->send($link, '✍️ Type the ' . ($method === 'bank_transfer' ? 'transfer reference' : 'card slip number') . ', or send <code>-</code> if there is none.');
    }

    /** @param array<string, mixed> $await */
    private function finishPaidOut(TelegramLink $link, User $user, array $await, string $text): bool
    {
        $refund = Refund::with('order:id,order_number')->find((int) ($await['id'] ?? 0));
        if ($refund === null || !$this->can($user, 'orders.refund')) {
            $this->c()->send($link, 'That refund can no longer be marked here.');

            return true;
        }
        $ref = trim($text);
        $ref = ($ref === '' || $ref === '-') ? null : mb_substr($ref, 0, 120);
        $method = (string) ($await['method'] ?? 'other');

        try {
            $updated = app(RefundWorkflowService::class)->markPaidOut($refund, $user, $method, $ref, $this->c()->requestAs($user));
        } catch (HttpExceptionInterface $e) {
            $this->c()->send($link, T::e($e->getMessage()));

            return true;
        }

        $label = ['bank_transfer' => 'bank transfer', 'card_terminal' => 'card', 'cash' => 'cash'][$method] ?? $method;
        [$html] = $this->owedCard($updated, '✅ Paid out by ' . $label . ($ref ? ' (' . T::e($ref) . ')' : '') . '. The customer has been told.');
        $messageId = (int) ($await['message_id'] ?? 0);
        if ($messageId > 0) {
            try {
                $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html);
            } catch (\Throwable) {
                // Too old to edit; the confirmation below says it.
            }
        }
        $this->c()->send($link, '✅ Marked paid out.');

        return true;
    }

    // ── Complaints ───────────────────────────────────────────────────────

    public function complaints(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'complaints.manage')) {
            $this->c()->refuse($link);

            return;
        }

        $entries = ComplaintBoxEntry::query()->whereIn('status', ComplaintBoxEntry::OPEN_STATUSES)->orderByDesc('created_at')->limit(8)->get();
        if ($entries->isEmpty()) {
            $this->c()->send($link, '💬 <b>No open complaints.</b>');

            return;
        }

        $count = ComplaintBoxEntry::query()->whereIn('status', ComplaintBoxEntry::OPEN_STATUSES)->count();
        $this->c()->send($link, '💬 <b>Open complaints</b> (' . $count . ')' . ($count > 8 ? ', newest 8' : ''));
        foreach ($entries as $entry) {
            [$html, $buttons] = $this->complaintCard($entry);
            $this->c()->send($link, $html, [], $buttons);
        }
    }

    /** @return array{0: string, 1: array<int, array<int, array<string, string>>>} */
    public function complaintCard(ComplaintBoxEntry $entry, ?string $note = null): array
    {
        $statusLabel = [
            ComplaintBoxEntry::STATUS_NEW => '🆕 New',
            ComplaintBoxEntry::STATUS_IN_PROGRESS => '👀 Taken up',
            ComplaintBoxEntry::STATUS_RESOLVED => '✅ Resolved',
            ComplaintBoxEntry::STATUS_CLOSED => 'Closed',
        ][$entry->status] ?? ucfirst((string) $entry->status);

        $lines = ['💬 <b>' . T::e((string) $entry->reference_number) . '</b> · ' . T::e($entry->categoriesLabel()) . ' · ' . $statusLabel];
        if ($entry->isAboutStaff()) {
            $lines[] = 'About: ' . T::e((string) $entry->about_staff);
        }
        if (trim((string) $entry->comment) !== '') {
            $lines[] = '';
            $lines[] = '“' . T::e(mb_substr((string) $entry->comment, 0, 900)) . '”';
            $lines[] = '';
        }
        $meta = array_filter([
            $entry->is_anonymous || !$entry->phone ? 'Anonymous' : T::e((string) $entry->phone),
            $entry->order_ref ? 'order ' . T::e((string) $entry->order_ref) : null,
            $entry->created_at ? T::agoPhrase($entry->created_at) : null,
        ]);
        $lines[] = implode(' · ', $meta);
        if ($entry->last_message) {
            $lines[] = 'Last reply: ' . T::e(mb_substr((string) $entry->last_message, 0, 200));
        }
        if ($note !== null) {
            $lines[] = '';
            $lines[] = $note;
        }

        $buttons = [];
        $row = [];
        if ($entry->phone && !$entry->is_anonymous) {
            $row[] = T::button('💬 Reply', 'cb:' . $entry->id . ':reply');
        }
        if ($entry->status === ComplaintBoxEntry::STATUS_NEW) {
            $row[] = T::button('👀 Taking it up', 'cb:' . $entry->id . ':take');
        }
        if ($entry->isOpen()) {
            $row[] = T::button('✅ Resolved', 'cb:' . $entry->id . ':done');
        }
        if ($row !== []) {
            $buttons[] = $row;
        }

        return [T::clip(implode("\n", $lines)), $buttons];
    }

    private function complaintTap(TelegramLink $link, User $user, int $messageId, string $arg, \Closure $answer): void
    {
        [$id, $what] = array_pad(explode(':', $arg, 2), 2, '');
        $entry = ComplaintBoxEntry::find((int) $id);
        if ($entry === null || !$this->can($user, 'complaints.manage')) {
            $answer('You cannot act on complaints.', true);

            return;
        }
        $service = app(ComplaintBoxService::class);

        if ($what === 'reply') {
            $answer();
            $this->c()->awaitReply($link, ['action' => 'complaint_reply', 'id' => $entry->id, 'message_id' => $messageId]);
            $this->c()->send($link, '✍️ Type your reply to ' . T::e((string) $entry->reference_number) . '. It goes to the customer by SMS (up to 600 characters).');

            return;
        }

        try {
            $entry = match ($what) {
                'take' => $service->changeStatus($entry, ComplaintBoxEntry::STATUS_IN_PROGRESS, $user),
                'done' => $service->changeStatus($entry, ComplaintBoxEntry::STATUS_RESOLVED, $user),
                default => null,
            };
        } catch (ValidationException $e) {
            $answer(collect($e->errors())->flatten()->first() ?? 'That did not work.', true);

            return;
        }
        if ($entry === null) {
            $answer('This button is no longer used.');

            return;
        }
        $answer($what === 'done' ? 'Marked resolved.' : 'Marked as taken up.');
        [$html, $buttons] = $this->complaintCard($entry);
        $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);
    }

    /** @param array<string, mixed> $await */
    private function finishComplaintReply(TelegramLink $link, User $user, array $await, string $text): bool
    {
        $entry = ComplaintBoxEntry::find((int) ($await['id'] ?? 0));
        if ($entry === null || !$this->can($user, 'complaints.manage')) {
            $this->c()->send($link, 'That complaint can no longer be answered here.');

            return true;
        }

        try {
            app(ComplaintBoxService::class)->messageCustomer($entry, $text, $user);
        } catch (ValidationException $e) {
            $this->c()->send($link, T::e((string) (collect($e->errors())->flatten()->first() ?? 'The reply did not go.')));

            return true;
        }

        $entry->refresh();
        if ($entry->status === ComplaintBoxEntry::STATUS_NEW) {
            $entry = app(ComplaintBoxService::class)->changeStatus($entry, ComplaintBoxEntry::STATUS_IN_PROGRESS, $user);
        }
        [$html, $buttons] = $this->complaintCard($entry);
        $messageId = (int) ($await['message_id'] ?? 0);
        if ($messageId > 0) {
            try {
                $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);
            } catch (\Throwable) {
                // Too old to edit.
            }
        }
        $this->c()->send($link, '✅ Reply sent to the customer.');

        return true;
    }

    // ── Customers ────────────────────────────────────────────────────────

    private function canCustomers(User $user): bool
    {
        return $this->can($user, 'customers.lookup') || $this->can($user, 'customers.view');
    }

    /** Returns null after replying (so it can stand in for "handled"). */
    public function customerSearch(TelegramLink $link, User $user, string $query): ?bool
    {
        if (!$this->canCustomers($user)) {
            $this->c()->refuse($link);

            return null;
        }
        $q = trim($query);
        $digits = preg_replace('/\D/', '', $q) ?? '';
        $search = Customer::query();
        if (strlen($digits) >= 5 && strlen($digits) >= mb_strlen(preg_replace('/[\s+\-]/', '', $q) ?? '') - 1) {
            $search->where('phone', 'like', '%' . substr($digits, -7) . '%');
        } elseif (mb_strlen($q) >= 2) {
            $search->whereRaw('LOWER(name) LIKE ?', ['%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_strtolower($q)) . '%']);
        } else {
            $this->c()->send($link, 'Type at least two letters of a name, or a phone number.');

            return null;
        }
        $found = $search->orderByDesc('updated_at')->limit(6)->get(['id', 'name', 'phone']);

        if ($found->isEmpty()) {
            $this->c()->send($link, 'No customer matches “' . T::e($q) . '”.');
        } elseif ($found->count() === 1) {
            $this->customerCard($link, $user, (int) $found->first()->id);
        } else {
            $buttons = $found->map(fn (Customer $c) => [T::button(mb_substr(($c->name ?: 'No name') . ' · ' . $c->phone, 0, 60), 'cu:' . $c->id)])->all();
            $this->c()->send($link, 'Which one?', [], $buttons);
        }

        return null;
    }

    public function customerCard(TelegramLink $link, User $user, int $id): void
    {
        if (!$this->canCustomers($user)) {
            $this->c()->refuse($link);

            return;
        }
        $customer = Customer::find($id);
        if ($customer === null) {
            $this->c()->send($link, 'That customer is no longer there.');

            return;
        }

        $loyalty = LoyaltyAccount::query()->where('customer_id', $customer->id)->first();
        $points = $loyalty ? max(0, (int) $loyalty->points_balance - (int) $loyalty->points_held) : (int) ($customer->loyalty_points ?? 0);
        $tier = ucfirst((string) ($loyalty->tier ?? $customer->tier ?? 'bronze'));
        $stats = Order::query()->where('customer_id', $customer->id)->whereNotNull('paid_at')
            ->selectRaw('COUNT(*) as n')
            ->selectRaw(ReportMoneySql::sumLaarAsMvr(ReportMoneySql::ORDER_TOTAL_LAAR) . ' as total')
            ->selectRaw('MAX(paid_at) as last_at')
            ->first();
        $recent = Order::query()->where('customer_id', $customer->id)->whereNotNull('paid_at')->orderByDesc('paid_at')->limit(3)->get(['order_number', 'total', 'paid_at', 'type']);
        $deposit = CustomerDepositAccount::query()->where('customer_id', $customer->id)->first();

        $lines = ['🔎 <b>' . T::e($customer->name ?: 'No name') . '</b>'];
        $lines[] = T::e((string) $customer->phone) . ($customer->email ? ' · ' . T::e((string) $customer->email) : '');
        $lines[] = '';
        $lines[] = '⭐ ' . $tier . ' · ' . number_format($points) . ' points to spend';
        $lines[] = '🧾 ' . (int) ($stats->n ?? 0) . ' orders · ' . T::mvr($stats->total ?? 0) . ' spent'
            . (!empty($stats->last_at) ? ' · last ' . Carbon::parse($stats->last_at)->format('j M Y') : '');
        if ((int) ($customer->credit_limit_laar ?? 0) > 0 || (int) ($customer->credit_balance_laar ?? 0) > 0) {
            $lines[] = '💳 Credit owed ' . T::mvr(((int) $customer->credit_balance_laar) / 100) . ' of ' . T::mvr(((int) $customer->credit_limit_laar) / 100)
                . ' · ' . T::e(str_replace('_', ' ', (string) $customer->credit_status));
        }
        if ($deposit !== null && (int) $deposit->balance_laar !== 0) {
            $lines[] = '💰 Deposit ' . T::mvr(((int) $deposit->balance_laar) / 100);
        }
        if ($customer->sms_opt_out) {
            $lines[] = '🔕 Has turned off promotional SMS';
        }
        if ($recent->isNotEmpty()) {
            $lines[] = '';
            $lines[] = '<b>Last orders</b>';
            foreach ($recent as $o) {
                $lines[] = '• #' . T::e((string) $o->order_number) . ' · ' . T::mvr($o->total) . ' · ' . ($o->paid_at ? $o->paid_at->format('j M') : '');
            }
        }

        $this->c()->send($link, implode("\n", $lines));
    }

    // ── Discount approval by button ──────────────────────────────────────

    /**
     * The card a discount approval code arrives as: who asked, how much, on
     * what; Approve / Decline for the approvers it went to; the code too,
     * for a till not yet updated.
     *
     * @return array{0: string, 1: array<int, array<int, array<string, string>>>}
     */
    public function discountCard(DiscountApproval $approval, User $user, string $smsText, ?string $note = null): array
    {
        $approval->loadMissing(['order:id,order_number,total', 'requester:id,name']);
        $code = preg_match('/\b(\d{4})\b/', $smsText, $m) ? $m[1] : null;
        $lines = [
            '🔑 <b>Discount ' . T::mvr($approval->discount_laar / 100) . '</b> (' . rtrim(rtrim(number_format((float) $approval->discount_percent, 1), '0'), '.') . '%) on order #' . T::e((string) ($approval->order?->order_number ?? $approval->order_id)),
            'Asked by ' . T::e($approval->requester?->name ?? 'staff') . ' · order ' . T::mvr($approval->subtotal_laar / 100),
        ];
        if (trim((string) $approval->reason) !== '') {
            $lines[] = 'Reason: ' . T::e(str_replace('_', ' ', (string) $approval->reason)) . ($approval->reason_note ? ' · ' . T::e((string) $approval->reason_note) : '');
        }
        if ($note !== null) {
            $lines[] = '';
            $lines[] = $note;

            return [implode("\n", $lines), []];
        }
        if ($code !== null) {
            $lines[] = '';
            $lines[] = 'Tap Approve and the till carries on, or read out the code <code>' . $code . '</code>.';
        }

        $buttons = app(DiscountApprovalService::class)->isApprover($approval, $user)
            ? [[T::button('✅ Approve', 'da:' . $approval->id), T::button('✖ Decline', 'dd:' . $approval->id)]]
            : [];

        return [implode("\n", $lines), $buttons];
    }

    private function discountTap(TelegramLink $link, User $user, int $messageId, int $id, bool $approve, \Closure $answer): void
    {
        $approval = DiscountApproval::find($id);
        if ($approval === null) {
            $answer('That request no longer exists.', true);

            return;
        }

        try {
            $approval = app(DiscountApprovalService::class)->decide($approval, $user, $approve, $this->c()->requestAs($user));
        } catch (HttpExceptionInterface $e) {
            $answer($e->getMessage(), true);

            return;
        }

        $answer($approve ? 'Approved. The till will apply it.' : 'Declined.');
        [$html] = $this->discountCard($approval, $user, '', $approve
            ? '✅ <b>Approved</b> by you, ' . now()->format('g:i a') . '. The till applies it now.'
            : '✖ <b>Declined</b> by you, ' . now()->format('g:i a') . '.');
        $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html);
    }
}
