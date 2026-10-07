<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Finance\Services\RefundWorkflowService;
use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Reporting\Support\ReportMoneySql;
use App\Domains\Shifts\Services\ShiftAccessService;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Http\Controllers\Api\FinanceReportController;
use App\Http\Controllers\Api\ShiftController;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Refund;
use App\Models\Shift;
use App\Models\TelegramLink;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * What a linked staff member can ask the bot, and what its buttons do.
 *
 * Step 1 (owner, 2026-10-06: "Build owner bot now"): Today, Shifts, Open
 * orders, Approvals, Sold out. Every command and button checks the
 * person's own permissions at the moment it runs, the same ones Admin and
 * the till use, so a menu entry never grants more than the account has.
 * The owner has every permission; a manager linked to the same bot sees
 * what their permissions allow.
 */
class TelegramCommands
{
    public const BTN_TODAY = '📊 Today';
    public const BTN_SHIFTS = '💵 Shifts';
    public const BTN_ORDERS = '🧾 Open orders';
    public const BTN_APPROVALS = '✅ Approvals';
    public const BTN_SOLD_OUT = '🚫 Sold out';
    public const BTN_WEEK = '📈 Week';
    public const BTN_CASHIERS = '👥 Cashiers';
    public const BTN_SHOP = '🏪 Shop';
    public const BTN_OWED = '💸 Refunds owed';
    public const BTN_COMPLAINTS = '💬 Complaints';
    public const BTN_CUSTOMER = '🔎 Customer';
    public const BTN_HELP = '❓ Help';

    /** Orders still being worked on (not unpaid online carts). */
    private const OPEN_STATUSES = ['pending', 'paid', 'partial', 'held', 'confirmed', 'in_progress', 'preparing', 'ready', 'out_for_delivery', 'on_the_way'];

    private const AWAIT_TTL_MINUTES = 10;

    public function __construct(
        private readonly TelegramClient $client,
        private readonly PermissionService $permissions,
    ) {}

    // ── Menu ─────────────────────────────────────────────────────────────

    /** The keyboard under the message box: only what this person may use. */
    public function menuKeyboard(User $user): array
    {
        $buttons = [];
        if ($this->can($user, 'reports.view')) {
            $buttons[] = self::BTN_TODAY;
        }
        if ($this->can($user, 'shifts.view_all_history')) {
            $buttons[] = self::BTN_SHIFTS;
        }
        if ($this->can($user, 'orders.view')) {
            $buttons[] = self::BTN_ORDERS;
        }
        if ($this->can($user, 'orders.refund') || $this->can($user, 'devices.approve')) {
            $buttons[] = self::BTN_APPROVALS;
        }
        if ($this->canSoldOut($user)) {
            $buttons[] = self::BTN_SOLD_OUT;
        }
        // Owner step 2 (2026-10-07).
        foreach ($this->extras()->menuButtons($user) as $button) {
            $buttons[] = $button;
        }
        $buttons[] = self::BTN_HELP;

        $rows = array_map(
            fn (array $pair) => array_map(fn (string $b) => ['text' => $b], $pair),
            array_chunk($buttons, 2),
        );

        return ['keyboard' => $rows, 'resize_keyboard' => true, 'is_persistent' => true];
    }

    public function welcome(TelegramLink $link): void
    {
        $user = $link->user;
        $name = T::e($link->displayName());
        $html = "👋 <b>Hi {$name}, you're linked.</b>\n\n"
            . "This chat now gets your Bake &amp; Grill alerts, and the buttons below show what your account can see and do.\n\n"
            . 'Tap <b>' . self::BTN_HELP . '</b> any time to see what each button does.';
        $this->send($link, $html, $user ? ['reply_markup' => $this->menuKeyboard($user)] : []);
    }

    /**
     * A text message from a linked person. Returns true when it was a command.
     */
    public function handleText(TelegramLink $link, string $text): bool
    {
        $user = $link->user;
        if ($user === null) {
            return false; // drivers: TelegramDriverDesk
        }

        $raw = trim($text);
        $lower = mb_strtolower($raw);
        $command = $this->commandName($raw);

        // A reply the bot asked for (the reason for rejecting a refund).
        $awaitKey = $this->awaitKey($link);
        $await = Cache::get($awaitKey);
        if (is_array($await) && $command === null && !$this->isMenuButton($raw)) {
            Cache::forget($awaitKey);

            return $this->answerAwait($link, $user, $await, $raw);
        }
        if (is_array($await)) {
            Cache::forget($awaitKey);
        }

        if ($raw === self::BTN_TODAY || $command === 'today') {
            $this->today($link, $user, $this->dateArgument($raw));

            return true;
        }
        if ($raw === self::BTN_SHIFTS || $command === 'shifts') {
            $this->shifts($link, $user);

            return true;
        }
        if ($raw === self::BTN_ORDERS || $command === 'orders') {
            $this->openOrders($link, $user);

            return true;
        }
        if ($raw === self::BTN_APPROVALS || $command === 'approvals') {
            $this->approvals($link, $user);

            return true;
        }
        if ($raw === self::BTN_SOLD_OUT || $command === 'soldout' || str_starts_with($lower, 'sold out')) {
            $query = $command === 'soldout'
                ? trim((string) preg_replace('/^\/\S+\s*/u', '', $raw))
                : trim(mb_substr($raw, $raw === self::BTN_SOLD_OUT ? mb_strlen($raw) : 8));
            $query === '' ? $this->soldOutList($link, $user) : $this->soldOutSearch($link, $user, $query, available: true);

            return true;
        }
        if ($command === 'back' || str_starts_with($lower, 'back on')) {
            $query = $command === 'back'
                ? trim((string) preg_replace('/^\/\S+\s*/u', '', $raw))
                : trim(mb_substr($raw, 7));
            $query === '' ? $this->soldOutList($link, $user) : $this->soldOutSearch($link, $user, $query, available: false);

            return true;
        }
        if ($this->extras()->handleText($link, $user, $raw, $command)) {
            return true;
        }
        if ($raw === self::BTN_HELP || $command === 'help' || $command === 'menu') {
            $this->help($link, $user);

            return true;
        }

        return false;
    }

    // ── Today ────────────────────────────────────────────────────────────

    public function today(TelegramLink $link, User $user, ?string $date = null): void
    {
        if (!$this->can($user, 'reports.view')) {
            $this->refuse($link);

            return;
        }

        $day = $date !== null ? Carbon::parse($date) : now();
        $lines = $this->dayReportLines($day);

        if ($day->isToday()) {
            $open = Shift::query()->whereNull('closed_at')->count();
            $lines[] = '';
            $lines[] = $open === 0 ? 'No shift open right now.' : ($open === 1 ? '1 shift open.' : "{$open} shifts open.");
        }

        $yesterday = $day->copy()->subDay()->toDateString();
        $this->send($link, implode("\n", $lines), [], [[T::button('◀ ' . Carbon::parse($yesterday)->format('D j M'), 'td:' . $yesterday)]]);
    }

    /**
     * The day's figures as message lines: Today, and the end-of-day report.
     *
     * @return list<string>
     */
    public function dayReportLines(Carbon $day): array
    {
        $s = $this->dailySummary($day->toDateString());
        $prev = $this->dailySummary($day->copy()->subWeek()->toDateString());

        $title = $day->isToday() ? 'Today' : $day->format('D j M');
        $lines = ["📊 <b>{$title}</b> · " . $day->format('D j M Y') . ($day->isToday() ? ' · ' . now()->format('g:i a') : '')];
        $lines[] = '';
        $lines[] = '<b>Sales</b> ' . T::mvr($s['revenue'] ?? 0) . $this->versus((float) ($s['revenue'] ?? 0), (float) ($prev['revenue'] ?? 0), $day);
        $lines[] = '<b>Orders</b> ' . (int) ($s['orders'] ?? 0) . ' · average ' . T::mvr($s['avg_order'] ?? 0);
        if ((float) ($s['discounts'] ?? 0) > 0) {
            $lines[] = '<b>Discounts</b> ' . T::mvr($s['discounts']);
        }
        if ((float) ($s['refunds'] ?? 0) > 0) {
            $lines[] = '<b>Refunds</b> ' . T::mvr($s['refunds']);
        }
        if ((float) ($s['wholesale_revenue'] ?? 0) > 0) {
            $lines[] = '<b>Wholesale</b> ' . T::mvr($s['wholesale_revenue']);
        }

        $byType = collect($s['by_type'] ?? [])->filter(fn ($r) => (int) ($r['count'] ?? 0) > 0);
        if ($byType->isNotEmpty()) {
            $lines[] = '';
            $lines[] = '<b>By type</b>';
            foreach ($byType as $r) {
                $lines[] = '• ' . T::e($this->typeLabel((string) $r['type'])) . ': ' . (int) $r['count'] . ' · ' . T::mvr($r['revenue']);
            }
        }

        $payments = $this->paymentsByMethod($day);
        if ($payments !== []) {
            $lines[] = '';
            $lines[] = '<b>Payments</b>';
            foreach ($payments as $method => $amount) {
                $lines[] = '• ' . T::e($this->methodLabel($method)) . ': ' . T::mvr($amount);
            }
        }

        $top = collect($s['top_items'] ?? [])->take(5);
        if ($top->isNotEmpty()) {
            $lines[] = '';
            $lines[] = '<b>Best sellers</b>';
            foreach ($top as $i => $r) {
                $lines[] = ($i + 1) . '. ' . T::e((string) ($r['name'] ?? '')) . ' × ' . (int) round((float) ($r['qty'] ?? 0));
            }
        }

        return $lines;
    }

    // ── Shifts ───────────────────────────────────────────────────────────

    public function shifts(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'shifts.view_all_history')) {
            $this->refuse($link);

            return;
        }

        $shifts = Shift::query()->whereNull('closed_at')->with(['user:id,name', 'device:id,name'])->orderBy('opened_at')->get();
        if ($shifts->isEmpty()) {
            $last = Shift::query()->whereNotNull('closed_at')->with('user:id,name')->latest('closed_at')->first();
            $html = '💵 <b>No shift is open.</b>';
            if ($last !== null) {
                $html .= "\n\nLast closed: " . T::e($last->user?->name) . ', ' . $last->closed_at->format('D j M, g:i a')
                    . $this->varianceLine($last);
            }
            $this->send($link, $html);

            return;
        }

        $calc = app(ShiftController::class);
        $lines = ['💵 <b>Open shifts</b> (' . $shifts->count() . ')'];
        foreach ($shifts as $shift) {
            $cash = $calc->expectedCashFor($shift);
            $sales = (float) Payment::query()
                ->where('shift_id', $shift->id)
                ->where('amount', '>', 0)
                ->whereIn('status', ['paid', 'completed', 'confirmed'])
                ->selectRaw('COALESCE(SUM(COALESCE(amount_laar, ROUND(amount * 100))), 0) / 100 as t')
                ->value('t');
            $orders = Order::query()->where('shift_id', $shift->id)->whereIn('status', ReportMoneySql::SALE_STATUSES)->count();

            $lines[] = '';
            $lines[] = '<b>' . T::e($shift->user?->name ?? 'Unknown') . '</b>' . ($shift->device?->name ? ' · ' . T::e($shift->device->name) : '');
            $lines[] = 'Open since ' . $shift->opened_at->format('g:i a') . ' (' . T::ago($shift->opened_at) . ')';
            $lines[] = 'Taken ' . T::mvr($sales) . ' · ' . $orders . ' ' . ($orders === 1 ? 'order' : 'orders');
            $lines[] = 'Float ' . T::mvr($cash['opening']) . ' · cash sales ' . T::mvr($cash['cash_sales']);
            if ((float) $cash['cash_in'] > 0 || (float) $cash['cash_out'] > 0) {
                $lines[] = 'Cash in ' . T::mvr($cash['cash_in']) . ' · out ' . T::mvr($cash['cash_out']);
            }
            if ((float) $cash['cash_refunds'] > 0) {
                $lines[] = 'Cash refunds ' . T::mvr($cash['cash_refunds']);
            }
            $lines[] = '<b>Should be in the drawer: ' . T::mvr($cash['expected']) . '</b>';
        }

        $this->send($link, T::clip(implode("\n", $lines)));
    }

    // ── Open orders ──────────────────────────────────────────────────────

    public function openOrders(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'orders.view')) {
            $this->refuse($link);

            return;
        }

        $orders = Order::query()
            ->whereIn('status', self::OPEN_STATUSES)
            ->where('created_at', '>=', now()->subDay())
            ->orderBy('created_at')
            ->get(['id', 'order_number', 'status', 'type', 'total', 'created_at', 'ticket_name', 'delivery_contact_name']);

        if ($orders->isEmpty()) {
            $this->send($link, '🧾 <b>No open orders.</b> Everything from the last 24 hours is finished.');

            return;
        }

        $counts = $orders->groupBy('status')->map->count();
        $summary = $counts->map(fn ($n, $status) => $this->statusLabel((string) $status) . ' ' . $n)->implode(' · ');
        $lines = ['🧾 <b>Open orders</b> (' . $orders->count() . ')', T::e($summary), ''];
        foreach ($orders->take(15) as $o) {
            $who = trim((string) ($o->ticket_name ?: $o->delivery_contact_name ?: ''));
            $lines[] = '<b>#' . T::e((string) ($o->order_number ?? $o->id)) . '</b> ' . T::e($this->statusLabel((string) $o->status))
                . ' · ' . T::e($this->typeLabel((string) $o->type)) . ' · ' . T::mvr($o->total)
                . ' · ' . T::ago($o->created_at) . ($who !== '' ? ' · ' . T::e($who) : '');
        }
        if ($orders->count() > 15) {
            $lines[] = '…and ' . ($orders->count() - 15) . ' more (oldest first).';
        }

        $this->send($link, T::clip(implode("\n", $lines)));
    }

    // ── Approvals (refunds) ──────────────────────────────────────────────

    public function approvals(TelegramLink $link, User $user): void
    {
        $canRefunds = $this->can($user, 'orders.refund');
        if (!$canRefunds && !$this->can($user, 'devices.approve')) {
            $this->refuse($link);

            return;
        }

        $refunds = $canRefunds
            ? Refund::query()->where('status', 'pending')->with(['order:id,order_number,total', 'requester:id,name'])->orderBy('created_at')->limit(10)->get()
            : collect();
        // New tills waiting for approval (2026-10-07).
        $devices = $this->extras()->pendingDevices($user);
        if ($refunds->isEmpty() && $devices->isEmpty()) {
            $this->send($link, '✅ <b>Nothing waiting for approval.</b>');

            return;
        }

        $this->send($link, '✅ <b>Waiting for approval</b> (' . ($refunds->count() + $devices->count()) . ')');
        foreach ($refunds as $refund) {
            [$html, $buttons] = $this->refundCard($refund, $user);
            $this->send($link, $html, [], $buttons);
        }
        foreach ($devices as $device) {
            [$html, $buttons] = $this->extras()->deviceCard($device, $user);
            $this->send($link, $html, [], $buttons);
        }
    }

    /** @return array{0: string, 1: array<int, array<int, array<string, string>>>} */
    public function refundCard(Refund $refund, User $user, ?string $note = null): array
    {
        $refund->loadMissing(['order:id,order_number,total', 'requester:id,name']);
        $orderNo = (string) ($refund->order?->order_number ?? $refund->order_id);
        $lines = [
            '↩️ <b>Refund ' . T::mvr($refund->amount) . '</b> on order #' . T::e($orderNo),
            'Order total ' . T::mvr($refund->order?->total ?? 0),
            'Asked by ' . T::e($refund->requester?->name ?? 'staff') . ', ' . T::agoPhrase($refund->created_at),
        ];
        if (trim((string) $refund->reason) !== '') {
            $lines[] = 'Reason: ' . T::e((string) $refund->reason);
        }
        $drawer = (int) ($refund->drawer_cash_out_laar ?? 0);
        if ($drawer > 0) {
            $lines[] = 'Cash from the drawer: ' . T::mvr($drawer / 100);
        }
        if ($refund->status !== 'pending') {
            $lines[] = '';
            $lines[] = '<b>' . T::e(ucfirst((string) $refund->status)) . '</b>' . ($note ? ' · ' . T::e($note) : '');

            return [implode("\n", $lines), []];
        }
        if ($note) {
            $lines[] = '';
            $lines[] = T::e($note);
        }

        $buttons = [];
        if ($this->permissions->isOwner($user) && $drawer === 0) {
            $buttons[] = T::button('✅ Approve', 'rfa:' . $refund->id);
        } elseif ($drawer > 0) {
            $lines[] = '';
            $lines[] = '<i>Pays cash from the drawer, so approve it at the till.</i>';
        } else {
            $lines[] = '';
            $lines[] = '<i>Needs the customer\'s code, so approve it at the till.</i>';
        }
        $buttons[] = T::button('✖ Reject', 'rfr:' . $refund->id);

        return [implode("\n", $lines), [$buttons]];
    }

    // ── Sold out ─────────────────────────────────────────────────────────

    public function soldOutList(TelegramLink $link, User $user): void
    {
        if (!$this->canSoldOut($user)) {
            $this->refuse($link);

            return;
        }

        $items = Item::query()->where('is_active', true)->where('is_available', false)->orderBy('name')->limit(30)->get(['id', 'name']);
        $help = "\n\nTo mark something sold out, type <code>sold out</code> and its name, e.g. <code>sold out kottu</code>.";
        if ($items->isEmpty()) {
            $this->send($link, '🚫 <b>Nothing is sold out.</b>' . $help);

            return;
        }

        $buttons = $items->map(fn (Item $i) => [T::button('↩ ' . mb_substr($i->name, 0, 40) . ' is back', 'son:' . $i->id)])->all();
        $this->send($link, '🚫 <b>Sold out now</b> (' . $items->count() . ")\nTap one when it is back on the menu." . $help, [], $buttons);
    }

    public function soldOutSearch(TelegramLink $link, User $user, string $query, bool $available): void
    {
        if (!$this->canSoldOut($user)) {
            $this->refuse($link);

            return;
        }

        $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], mb_strtolower($query)) . '%';
        $items = Item::query()
            ->where('is_active', true)
            ->where('is_available', $available)
            ->whereRaw('LOWER(name) LIKE ?', [$like])
            ->orderBy('name')
            ->limit(8)
            ->get(['id', 'name']);

        if ($items->isEmpty()) {
            $this->send($link, $available
                ? 'No item on the menu matches “' . T::e($query) . '”.'
                : 'No sold-out item matches “' . T::e($query) . '”.');

            return;
        }

        $action = $available ? 'sof' : 'son';
        $label = $available ? '🚫 Mark sold out: ' : '↩ Back on: ';
        $buttons = $items->map(fn (Item $i) => [T::button($label . mb_substr($i->name, 0, 40), $action . ':' . $i->id)])->all();
        $this->send($link, $items->count() === 1 ? 'Tap to confirm:' : 'Which one?', [], $buttons);
    }

    // ── Help ─────────────────────────────────────────────────────────────

    public function help(TelegramLink $link, User $user): void
    {
        $lines = ['❓ <b>What the buttons do</b>', ''];
        if ($this->can($user, 'reports.view')) {
            $lines[] = '<b>' . self::BTN_TODAY . '</b>: sales, orders, payments and best sellers so far today, compared with the same day last week. <code>/today 2026-10-05</code> for another day.';
        }
        if ($this->can($user, 'shifts.view_all_history')) {
            $lines[] = '<b>' . self::BTN_SHIFTS . '</b>: who is on the till, what they have taken, and the cash that should be in each drawer.';
        }
        if ($this->can($user, 'orders.view')) {
            $lines[] = '<b>' . self::BTN_ORDERS . '</b>: orders not finished yet, oldest first.';
        }
        if ($this->can($user, 'orders.refund') || $this->can($user, 'devices.approve')) {
            $lines[] = '<b>' . self::BTN_APPROVALS . '</b>: refunds and new tills waiting for a decision, with Approve and Reject buttons.';
        }
        if ($this->canSoldOut($user)) {
            $lines[] = '<b>' . self::BTN_SOLD_OUT . '</b>: what is sold out. Type <code>sold out kottu</code> to mark an item, <code>back on kottu</code> to bring it back. It changes the till, the website, the order app and the TV screens.';
        }
        if ($this->can($user, 'reports.view')) {
            $lines[] = '<b>' . self::BTN_WEEK . '</b>: this week so far against the same days last week, best and quietest day. <code>/month</code> for the month.';
            $lines[] = '<b>' . self::BTN_CASHIERS . '</b>: each cashier\'s sales, orders, discounts and refunds today.';
        }
        if ($this->can($user, 'service_availability.manage_public') || $this->can($user, 'settings.update')) {
            $lines[] = '<b>' . self::BTN_SHOP . '</b>: pause or resume online orders and delivery; mark today or tomorrow closed.';
        }
        if ($this->can($user, 'orders.refund')) {
            $lines[] = '<b>' . self::BTN_OWED . '</b>: card and bank refunds still to pay back, with a button to mark each paid.';
        }
        if ($this->can($user, 'complaints.manage')) {
            $lines[] = '<b>' . self::BTN_COMPLAINTS . '</b>: open complaints, with Reply (texts the customer), Taking it up and Resolved.';
        }
        if ($this->can($user, 'customers.lookup') || $this->can($user, 'customers.view')) {
            $lines[] = '<b>' . self::BTN_CUSTOMER . '</b>: type a phone number or name to see points, orders, credit and deposit.';
        }
        $lines[] = '';
        if ($this->can($user, 'promotions.discount_override') || $this->permissions->isOwner($user)) {
            $lines[] = 'Discount requests from the till come with Approve and Decline: tap Approve and the till carries on, no code to read out.';
        }
        if ($this->permissions->isOwner($user) || $this->can($user, 'reports.view')) {
            $lines[] = 'When the last shift of the day closes, the day\'s report arrives here.';
        }
        $lines[] = 'Your alerts (refund requests, shifts left open, cash differences, complaints, stock and more) arrive here as well.';
        $lines[] = '<code>/stop</code> unlinks this chat.';

        $this->send($link, implode("\n", $lines), ['reply_markup' => $this->menuKeyboard($user)]);
    }

    // ── Buttons ──────────────────────────────────────────────────────────

    /**
     * @param array<string, mixed> $callback Telegram's callback_query
     */
    public function handleCallback(TelegramLink $link, array $callback): void
    {
        $bot = $link->bot;
        $id = (string) ($callback['id'] ?? '');
        $data = (string) ($callback['data'] ?? '');
        $messageId = (int) ($callback['message']['message_id'] ?? 0);
        $user = $link->user;
        if ($user === null) {
            $this->client->answerCallback($bot, $id, 'That button is not for drivers.');

            return;
        }

        [$action, $arg] = array_pad(explode(':', $data, 2), 2, '');

        try {
            match ($action) {
                'td' => $this->callbackToday($link, $user, $id, $arg),
                'rfa' => $this->callbackRefundConfirm($link, $user, $id, $messageId, (int) $arg),
                'rfy' => $this->callbackRefundApprove($link, $user, $id, $messageId, (int) $arg),
                'rfc' => $this->callbackRefundCancel($link, $user, $id, $messageId, (int) $arg),
                'rfr' => $this->callbackRefundReject($link, $user, $id, $messageId, (int) $arg),
                'sof', 'son' => $this->callbackSoldOut($link, $user, $id, $messageId, (int) $arg, $action === 'son'),
                default => $this->extrasCallback($link, $user, $id, $messageId, $action, $arg),
            };
        } catch (Throwable $e) {
            report($e);
            $this->client->answerCallback($bot, $id, 'Something went wrong. Try again in Admin.', true);
        }
    }

    private function extrasCallback(TelegramLink $link, User $user, string $callbackId, int $messageId, string $action, string $arg): void
    {
        if (!$this->extras()->handleCallback($link, $user, $callbackId, $messageId, $action, $arg)) {
            $this->client->answerCallback($link->bot, $callbackId, 'This button is no longer used.');
        }
    }

    private function callbackToday(TelegramLink $link, User $user, string $callbackId, string $date): void
    {
        $this->client->answerCallback($link->bot, $callbackId);
        $this->today($link, $user, preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) ? $date : null);
    }

    private function callbackRefundConfirm(TelegramLink $link, User $user, string $callbackId, int $messageId, int $refundId): void
    {
        $refund = Refund::find($refundId);
        if ($refund === null || !$this->permissions->isOwner($user)) {
            $this->client->answerCallback($link->bot, $callbackId, 'Only the owner can approve from Telegram.', true);

            return;
        }
        [$html] = $this->refundCard($refund, $user);
        if ($refund->status !== 'pending') {
            $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html);
            $this->client->answerCallback($link->bot, $callbackId, 'Already ' . $refund->status . '.');

            return;
        }
        $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html . "\n\n<b>Approve this refund without the customer's code?</b>", [[
            T::button('✅ Yes, approve', 'rfy:' . $refund->id),
            T::button('Cancel', 'rfc:' . $refund->id),
        ]]);
        $this->client->answerCallback($link->bot, $callbackId);
    }

    private function callbackRefundCancel(TelegramLink $link, User $user, string $callbackId, int $messageId, int $refundId): void
    {
        $refund = Refund::find($refundId);
        if ($refund !== null) {
            [$html, $buttons] = $this->refundCard($refund, $user);
            $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);
        }
        $this->client->answerCallback($link->bot, $callbackId);
    }

    private function callbackRefundApprove(TelegramLink $link, User $user, string $callbackId, int $messageId, int $refundId): void
    {
        $refund = Refund::find($refundId);
        if ($refund === null) {
            $this->client->answerCallback($link->bot, $callbackId, 'That refund no longer exists.', true);

            return;
        }
        if (!$this->permissions->isOwner($user) || !$this->can($user, 'orders.refund')) {
            $this->client->answerCallback($link->bot, $callbackId, 'Only the owner can approve from Telegram.', true);

            return;
        }
        if ((int) ($refund->drawer_cash_out_laar ?? 0) > 0) {
            $this->client->answerCallback($link->bot, $callbackId, 'This one pays cash from the drawer. Approve it at the till.', true);

            return;
        }

        try {
            $approved = app(RefundWorkflowService::class)->approve(
                $refund,
                $user,
                $this->requestAs($user),
                allowSelf: false,
                otpCode: null,
                ownerOverrideWithoutOtp: true,
                drawerShiftId: app(ShiftAccessService::class)->findOpenShift($user)?->id,
            );
        } catch (HttpExceptionInterface $e) {
            $this->client->answerCallback($link->bot, $callbackId, $e->getMessage(), true);
            [$html, $buttons] = $this->refundCard($refund->fresh() ?? $refund, $user, $e->getMessage());
            $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);

            return;
        }

        [$html] = $this->refundCard($approved, $user, 'by you on Telegram, ' . now()->format('g:i a'));
        $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html);
        $this->client->answerCallback($link->bot, $callbackId, 'Approved.');
    }

    private function callbackRefundReject(TelegramLink $link, User $user, string $callbackId, int $messageId, int $refundId): void
    {
        $refund = Refund::find($refundId);
        if ($refund === null || !$this->can($user, 'orders.refund')) {
            $this->client->answerCallback($link->bot, $callbackId, 'You cannot decide refunds.', true);

            return;
        }
        if ($refund->status !== 'pending') {
            [$html] = $this->refundCard($refund, $user);
            $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html);
            $this->client->answerCallback($link->bot, $callbackId, 'Already ' . $refund->status . '.');

            return;
        }

        Cache::put($this->awaitKey($link), ['action' => 'refund_reject', 'id' => $refund->id, 'message_id' => $messageId], now()->addMinutes(self::AWAIT_TTL_MINUTES));
        $this->client->answerCallback($link->bot, $callbackId);
        $this->send($link, '✍️ Type the reason for rejecting the ' . T::mvr($refund->amount) . ' refund. The customer is told it. (Or tap any button below to cancel.)');
    }

    private function callbackSoldOut(TelegramLink $link, User $user, string $callbackId, int $messageId, int $itemId, bool $backOn): void
    {
        if (!$this->canSoldOut($user)) {
            $this->client->answerCallback($link->bot, $callbackId, 'You cannot change what is sold out.', true);

            return;
        }
        $item = Item::query()->where('is_active', true)->find($itemId);
        if ($item === null) {
            $this->client->answerCallback($link->bot, $callbackId, 'That item is no longer on the menu.', true);

            return;
        }

        $was = (bool) $item->is_available;
        if ($was !== $backOn) {
            $item->update(['is_available' => $backOn]);
            app(AuditLogService::class)->log(
                $backOn ? 'item.un86' : 'item.86',
                'Item',
                $item->id,
                ['is_available' => $was],
                ['is_available' => $backOn],
                ['source' => 'telegram', 'item_name' => $item->name],
                $this->requestAs($user),
            );
        }

        $text = $backOn
            ? '↩ <b>' . T::e($item->name) . '</b> is back on the menu.'
            : '🚫 <b>' . T::e($item->name) . '</b> is sold out on the till, website, order app and TV screens.';
        $buttons = $backOn ? null : [[T::button('↩ Undo, it is back', 'son:' . $item->id)]];
        $this->client->editMessage($link->bot, $link->chat_id, $messageId, $text, $buttons);
        $this->client->answerCallback($link->bot, $callbackId, $backOn ? 'Back on the menu.' : 'Marked sold out.');
    }

    // ── Replies the bot asked for ────────────────────────────────────────

    /** @param array<string, mixed> $await */
    private function answerAwait(TelegramLink $link, User $user, array $await, string $text): bool
    {
        if (($await['action'] ?? '') !== 'refund_reject') {
            return $this->extras()->answerAwait($link, $user, $await, $text);
        }

        $refund = Refund::find((int) ($await['id'] ?? 0));
        if ($refund === null || !$this->can($user, 'orders.refund')) {
            $this->send($link, 'That refund can no longer be decided here.');

            return true;
        }
        $reason = trim($text);
        if (mb_strlen($reason) < 3) {
            Cache::put($this->awaitKey($link), $await, now()->addMinutes(self::AWAIT_TTL_MINUTES));
            $this->send($link, 'A few words, please: the customer sees this reason.');

            return true;
        }

        try {
            $rejected = app(RefundWorkflowService::class)->reject($refund, $user, mb_substr($reason, 0, 1000), $this->requestAs($user));
        } catch (HttpExceptionInterface $e) {
            $this->send($link, T::e($e->getMessage()));

            return true;
        }

        [$html] = $this->refundCard($rejected, $user, 'by you: ' . $reason);
        $messageId = (int) ($await['message_id'] ?? 0);
        if ($messageId > 0) {
            try {
                $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html);
            } catch (Throwable) {
                // The card may be too old to edit; the confirmation below is enough.
            }
        }
        $this->send($link, '✖ Rejected. The customer will be told.');

        return true;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Owner step 2: week and month, cashiers, shop, refunds owed, complaints, customers, discount approvals. */
    public function extras(): TelegramOwnerExtras
    {
        return app(TelegramOwnerExtras::class);
    }

    /** Ask the person for a reply; their next message answers it (10 minutes). */
    public function awaitReply(TelegramLink $link, array $await): void
    {
        Cache::put($this->awaitKey($link), $await, now()->addMinutes(self::AWAIT_TTL_MINUTES));
    }

    /**
     * @param array<string, mixed> $extra
     * @param array<int, array<int, array<string, string>>>|null $buttons
     */
    public function send(TelegramLink $link, string $html, array $extra = [], ?array $buttons = null): void
    {
        $this->client->sendMessage($link->bot, $link->chat_id, $html, $buttons, $extra);
    }

    public function refuse(TelegramLink $link): void
    {
        $this->send($link, 'Your account does not have access to that.');
    }

    public function can(User $user, string $permission): bool
    {
        return $this->permissions->hasPermission($user, $permission);
    }

    private function canSoldOut(User $user): bool
    {
        return $this->can($user, 'kds.manage_availability') || $this->can($user, 'menu.manage') || $this->can($user, 'menu.prepared_stock');
    }

    /** A request carrying this user, so audit logs and services record who acted. */
    public function requestAs(User $user): Request
    {
        $request = Request::create('/telegram', 'POST', [], [], [], ['HTTP_USER_AGENT' => 'Telegram bot', 'REMOTE_ADDR' => '127.0.0.1']);
        $request->setUserResolver(fn () => $user);

        return $request;
    }

    public function awaitKey(TelegramLink $link): string
    {
        return 'telegram:await:' . $link->telegram_bot_id . ':' . $link->chat_id;
    }

    private function commandName(string $text): ?string
    {
        if (!preg_match('/^\/([a-z_]+)(?:@\w+)?(?:\s|$)/i', $text, $m)) {
            return null;
        }

        return strtolower($m[1]);
    }

    private function isMenuButton(string $text): bool
    {
        return in_array($text, [
            self::BTN_TODAY, self::BTN_SHIFTS, self::BTN_ORDERS, self::BTN_APPROVALS, self::BTN_SOLD_OUT, self::BTN_HELP,
            self::BTN_WEEK, self::BTN_CASHIERS, self::BTN_SHOP, self::BTN_OWED, self::BTN_COMPLAINTS, self::BTN_CUSTOMER,
        ], true);
    }

    private function dateArgument(string $text): ?string
    {
        if (preg_match('/(\d{4}-\d{2}-\d{2})/', $text, $m)) {
            return $m[1];
        }
        if (preg_match('/\byesterday\b/i', $text)) {
            return now()->subDay()->toDateString();
        }

        return null;
    }

    /** @return array<string, mixed> The same figures as Admin → Reports → Daily summary. */
    public function dailySummary(string $date): array
    {
        $request = Request::create('/api/reports/daily-summary', 'GET', ['date' => $date]);

        return (array) app(FinanceReportController::class)->dailySummary($request)->getData(true);
    }

    /**
     * How the day's sales were paid: the same orders as "Sales" (made that
     * day, in a sale status), so the two add up.
     *
     * @return array<string, float>
     */
    public function paymentsByMethod(Carbon $day): array
    {
        return Payment::query()
            ->join('orders', 'orders.id', '=', 'payments.order_id')
            ->whereNull('orders.deleted_at')
            ->whereBetween('orders.created_at', [$day->copy()->startOfDay(), $day->copy()->endOfDay()])
            ->whereIn('orders.status', ReportMoneySql::SALE_STATUSES)
            ->where('payments.amount', '>', 0)
            ->whereIn('payments.status', ['paid', 'completed', 'confirmed'])
            ->selectRaw('payments.method as method, COALESCE(SUM(COALESCE(payments.amount_laar, ROUND(payments.amount * 100))), 0) / 100 as total')
            ->groupBy('payments.method')
            ->orderByDesc('total')
            ->pluck('total', 'method')
            ->map(fn ($v) => (float) $v)
            ->filter(fn (float $v) => $v > 0)
            ->all();
    }

    private function versus(float $now, float $before, Carbon $day): string
    {
        // Mid-day "today" against a whole day last week would always look
        // down, so the comparison is only for finished days.
        if ($day->isToday() || $before <= 0) {
            return '';
        }
        $pct = (int) round(($now - $before) / $before * 100);

        return ' (' . ($pct >= 0 ? '+' : '') . $pct . '% on ' . $day->copy()->subWeek()->format('D j M') . ')';
    }

    private function varianceLine(Shift $shift): string
    {
        $v = (float) ($shift->variance ?? 0);
        if (abs($v) < 0.005) {
            return ', drawer matched.';
        }

        return ', drawer ' . ($v < 0 ? 'short ' : 'over ') . T::mvr(abs($v)) . '.';
    }

    public function statusLabel(string $status): string
    {
        return match ($status) {
            'pending' => 'Waiting',
            'paid' => 'Paid',
            'partial' => 'Part paid',
            'held' => 'Held',
            'confirmed' => 'Confirmed',
            'in_progress', 'preparing' => 'Cooking',
            'ready' => 'Ready',
            'out_for_delivery', 'on_the_way' => 'On the way',
            default => ucfirst(str_replace('_', ' ', $status)),
        };
    }

    public function typeLabel(string $type): string
    {
        return match ($type) {
            'dine_in' => 'Dine in',
            'takeaway' => 'Takeaway',
            'delivery' => 'Delivery',
            'online_pickup' => 'Online pickup',
            'pickup' => 'Pickup',
            'unknown', '' => 'Other',
            default => ucfirst(str_replace('_', ' ', $type)),
        };
    }

    public function methodLabel(string $method): string
    {
        return match ($method) {
            'cash' => 'Cash',
            'card' => 'Card',
            'bml', 'bml_gateway', 'bml_connect' => 'BML online',
            'stripe' => 'Card online',
            'wallet' => 'Deposit',
            'house_account' => 'House account',
            'transfer', 'bank_transfer' => 'Bank transfer',
            'gift_card' => 'Gift card',
            'credit' => 'Credit account',
            'loyalty' => 'Points',
            default => ucfirst(str_replace('_', ' ', $method)),
        };
    }
}
