<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Listeners\SendDayReportOnLastShiftClose;
use App\Domains\Telegram\Support\TelegramOrderText as O;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\CashMovement;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\Shift;
use App\Models\SiteSetting;
use App\Models\TelegramLink;
use App\Models\TimePunch;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\PurchaseRequestService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * More for the owner (2026-10-07: "Next", the extra owner buttons), behind
 * one 🧰 More button so the menu stays short:
 *  - 👷 Who's working: clocked in on the time clock, and on a till;
 *  - 📉 Low stock: stock at or under its reorder point, with "add to the
 *    buying list" per item or all at once;
 *  - 🔍 Find an order: by number, the whole order;
 *  - 📣 Message staff: a note to everyone, a role or one person.
 * And two Telegram-only alerts (Admin → Telegram switches): an order
 * cancelled at the till, and cash taken out of a drawer.
 * Each checks the person's own permissions, like every other button.
 */
class TelegramOwnerTools
{
    public const BTN_MORE = '🧰 More';

    public const SETTING_VOIDS = 'telegram_alert_voids';
    public const SETTING_CASH = 'telegram_alert_cash';
    public const SETTING_CASH_MIN = 'telegram_alert_cash_min';

    private const TELL_GROUPS = [
        'all' => 'Everyone',
        'manager' => 'Managers',
        'staff' => 'Cashiers',
        'kitchen_staff' => 'Kitchen',
        'driver' => 'Drivers',
    ];

    public function __construct(
        private readonly TelegramClient $client,
        private readonly PermissionService $permissions,
    ) {}

    /** @return list<array{0: string, 1: string}> label, callback */
    private function tools(User $user): array
    {
        $t = [];
        if ($this->can($user, 'staff.view')) {
            $t[] = ['👷 Who\'s working', 'mo:w'];
        }
        if ($this->can($user, 'inventory.view')) {
            $t[] = ['📉 Low stock', 'mo:l'];
        }
        if ($this->can($user, 'orders.view')) {
            $t[] = ['🔍 Find an order', 'mo:f'];
        }
        if ($this->can($user, 'telegram.manage')) {
            $t[] = ['📣 Message staff', 'mo:m'];
        }

        return $t;
    }

    /** @return list<string> */
    public function menuButtons(User $user): array
    {
        return $this->tools($user) === [] ? [] : [self::BTN_MORE];
    }

    /** @return list<string> */
    public function helpLines(User $user): array
    {
        if ($this->tools($user) === []) {
            return [];
        }
        $names = implode(', ', array_map(fn (array $x) => $x[0], $this->tools($user)));

        return ['<b>' . self::BTN_MORE . '</b>: ' . T::e($names) . '. Also <code>/working</code>, <code>/lowstock</code>, <code>/order 1042</code>, <code>/tell kitchen Gas comes at 3</code>.'];
    }

    public function handleText(TelegramLink $link, User $user, string $raw, ?string $command): bool
    {
        $arg = trim((string) preg_replace('/^\/\S+\s*/u', '', $raw));
        if ($raw === self::BTN_MORE || $command === 'more') {
            $this->more($link, $user);

            return true;
        }
        if ($command === 'working') {
            $this->working($link, $user);

            return true;
        }
        if ($command === 'lowstock') {
            $this->lowStock($link, $user);

            return true;
        }
        if ($command === 'order') {
            $arg === '' ? $this->askOrder($link, $user) : $this->findOrder($link, $user, $arg);

            return true;
        }
        if ($command === 'tell') {
            $this->tellCommand($link, $user, $arg);

            return true;
        }

        return false;
    }

    public function more(TelegramLink $link, User $user): void
    {
        $tools = $this->tools($user);
        if ($tools === []) {
            $this->c()->refuse($link);

            return;
        }
        $rows = array_map(fn (array $pair) => array_map(fn (array $x) => T::button($x[0], $x[1]), $pair), array_chunk($tools, 2));
        $this->c()->send($link, '🧰 <b>More</b>', [], $rows);
    }

    // ── Who's working ────────────────────────────────────────────────────

    public function working(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'staff.view')) {
            $this->c()->refuse($link);

            return;
        }
        $punches = TimePunch::query()->with('user:id,name')->whereNull('clocked_out_at')->where('clocked_in_at', '>=', now()->subDay())->orderBy('clocked_in_at')->get();
        $shifts = Shift::query()->with(['user:id,name', 'device:id,name'])->whereNull('closed_at')->orderBy('opened_at')->get();
        if ($punches->isEmpty() && $shifts->isEmpty()) {
            $this->c()->send($link, '👷 <b>Nobody is clocked in or on a till.</b>');

            return;
        }
        $lines = ['👷 <b>Who\'s working</b>'];
        if ($punches->isNotEmpty()) {
            $lines[] = '';
            $lines[] = '<b>Clocked in</b> (' . $punches->count() . ')';
            foreach ($punches as $p) {
                $lines[] = '• ' . T::e($p->user?->name ?? 'Someone') . ' · since ' . $p->clocked_in_at->format('g:i a') . ' (' . T::ago($p->clocked_in_at) . ')'
                    . ((float) $p->break_minutes > 0 ? ' · break ' . (int) $p->break_minutes . 'm' : '');
            }
        }
        if ($shifts->isNotEmpty()) {
            $lines[] = '';
            $lines[] = '<b>On a till</b> (' . $shifts->count() . ')';
            foreach ($shifts as $s) {
                $lines[] = '• ' . T::e($s->user?->name ?? 'Someone') . ($s->device?->name ? ' · ' . T::e($s->device->name) : '') . ' · since ' . $s->opened_at->format('g:i a');
            }
        }
        $this->c()->send($link, implode("\n", $lines));
    }

    // ── Low stock ────────────────────────────────────────────────────────

    public function lowStock(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'inventory.view')) {
            $this->c()->refuse($link);

            return;
        }
        $items = $this->lowItems();
        if ($items->isEmpty()) {
            $this->c()->send($link, '📉 <b>Nothing is under its reorder point.</b>');

            return;
        }
        $onList = $this->onBuyingList($items->pluck('id')->all());
        $lines = ['📉 <b>Low stock</b> (' . $items->count() . ')', ''];
        foreach ($items->take(20) as $i) {
            $lines[] = ((float) $i->current_stock <= 0 ? '🔴 ' : '🟠 ') . T::e($i->name) . ' · ' . $this->amount((float) $i->current_stock, (string) $i->unit)
                . ' (reorder at ' . $this->amount((float) $i->reorder_point, (string) $i->unit) . ')'
                . (isset($onList[$i->id]) ? ' · 🛒 on the list' : '');
        }
        $buttons = [];
        if ($this->can($user, 'purchase_requests.create')) {
            $missing = $items->reject(fn (InventoryItem $i) => isset($onList[$i->id]))->take(8);
            foreach ($missing->chunk(2) as $pair) {
                $buttons[] = $pair->map(fn (InventoryItem $i) => T::button('➕ ' . mb_substr($i->name, 0, 22), 'lo:a:' . $i->id))->values()->all();
            }
            if ($missing->count() > 1) {
                $buttons[] = [T::button('🛒 Add all ' . $items->reject(fn (InventoryItem $i) => isset($onList[$i->id]))->count() . ' to the buying list', 'lo:all')];
            }
        }
        $this->c()->send($link, T::clip(implode("\n", $lines)), [], $buttons);
    }

    /** @return Collection<int, InventoryItem> worst first */
    private function lowItems(): Collection
    {
        return InventoryItem::query()
            ->where('is_active', true)
            ->where('reorder_point', '>', 0)
            ->whereColumn('current_stock', '<=', 'reorder_point')
            ->get(['id', 'name', 'unit', 'current_stock', 'reorder_point', 'reorder_quantity'])
            ->sortBy(fn (InventoryItem $i) => (float) $i->current_stock / max(0.0001, (float) $i->reorder_point))
            ->values();
    }

    /**
     * Stock items already on an open buying-list line.
     *
     * @param list<int> $ids
     * @return array<int, true>
     */
    private function onBuyingList(array $ids): array
    {
        return PurchaseRequestItem::query()
            ->whereIn('inventory_item_id', $ids)
            ->whereNotIn('status', PurchaseRequestItem::TERMINAL_STATUSES)
            ->whereHas('purchaseRequest', fn ($q) => $q->whereIn('status', PurchaseRequest::OPEN_STATUSES))
            ->pluck('inventory_item_id')
            ->mapWithKeys(fn ($id) => [(int) $id => true])
            ->all();
    }

    /** @param list<int> $ids */
    private function addToBuyingList(TelegramLink $link, User $user, array $ids): ?string
    {
        if (!$this->can($user, 'purchase_requests.create')) {
            return 'Your account cannot add to the buying list.';
        }
        $onList = $this->onBuyingList($ids);
        $items = InventoryItem::query()->whereIn('id', array_values(array_filter($ids, fn (int $id) => !isset($onList[$id]))))->get();
        if ($items->isEmpty()) {
            return 'Already on the buying list.';
        }
        $lines = $items->map(fn (InventoryItem $i) => [
            'inventory_item_id' => $i->id,
            'requested_qty' => (float) $i->reorder_quantity > 0 ? (float) $i->reorder_quantity : max(1.0, ceil((float) $i->reorder_point - (float) $i->current_stock)),
            'requested_unit' => (string) $i->unit !== '' ? (string) $i->unit : 'pcs',
            'reason' => 'low_stock',
        ])->values()->all();
        try {
            app(PurchaseRequestService::class)->create($user, ['source' => 'telegram', 'title' => 'Low stock'], $lines, $this->c()->requestAs($user));
        } catch (ValidationException $e) {
            return (string) (collect($e->errors())->flatten()->first() ?? $e->getMessage());
        }

        return null;
    }

    // ── Find an order ────────────────────────────────────────────────────

    public function askOrder(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'orders.view')) {
            $this->c()->refuse($link);

            return;
        }
        $this->c()->awaitReply($link, ['action' => 'find_order']);
        $this->c()->send($link, '🔍 Type the order number, e.g. <code>1042</code> or <code>BG-1042</code>.');
    }

    public function findOrder(TelegramLink $link, User $user, string $query): void
    {
        if (!$this->can($user, 'orders.view')) {
            $this->c()->refuse($link);

            return;
        }
        $q = trim(ltrim(trim($query), '#'));
        if ($q === '') {
            $this->askOrder($link, $user);

            return;
        }
        $orders = Order::query()->where('order_number', $q)->limit(1)->get();
        if ($orders->isEmpty()) {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q);
            $orders = Order::query()->where('order_number', 'like', $like)->latest('id')->limit(5)->get();
        }
        if ($orders->isEmpty()) {
            $this->c()->send($link, 'No order numbered “' . T::e($q) . '”.');

            return;
        }
        if ($orders->count() > 1) {
            $buttons = $orders->map(fn (Order $o) => [T::button('#' . $o->order_number . ' · ' . $o->created_at?->format('j M g:i a') . ' · ' . T::mvr($o->total), 'fo:' . $o->id)])->all();
            $this->c()->send($link, 'Which one?', [], $buttons);

            return;
        }
        $this->c()->send($link, $this->orderCard($orders->first()));
    }

    public function orderCard(Order $o): string
    {
        $o->loadMissing(['items.modifiers', 'customer', 'user:id,name', 'deliveryDriver:id,name', 'table:id,name']);
        $c = $this->c();
        $lines = ['🔍 <b>Order ' . O::number($o) . '</b> · ' . T::e($c->typeLabel((string) $o->type)) . ' · ' . T::e($c->statusLabel((string) $o->status))];
        $lines[] = 'Placed ' . ($o->created_at?->format('D j M, g:i a') ?? '') . ' · ' . ($o->user ? 'by ' . T::e($o->user->name) : 'online');
        $where = array_filter([$o->table?->name ? 'table ' . $o->table->name : null, $o->ticket_name]);
        if ($where !== []) {
            $lines[] = T::e(implode(' · ', $where));
        }
        $lines[] = '';
        foreach (O::itemLines($o, 15) as $l) {
            $lines[] = $l;
        }
        $lines[] = '';
        $paidBy = O::paidBy($o, fn (string $m) => $c->methodLabel($m));
        $lines[] = '<b>' . T::mvr($o->total) . '</b> · ' . ($o->payment_status === 'paid' ? 'paid' : str_replace('_', ' ', (string) ($o->payment_status ?: 'unpaid'))) . ($paidBy !== '' ? ', ' . T::e($paidBy) : '');
        if ((float) $o->discount_amount > 0) {
            $lines[] = 'Discount ' . T::mvr($o->discount_amount);
        }
        $who = array_filter([O::customerName($o), O::customerPhone($o)]);
        if ($who !== []) {
            $lines[] = '👤 ' . T::e(implode(' · ', $who));
        }
        if ($o->type === 'delivery') {
            $lines[] = '📍 ' . T::e(O::address($o) ?: 'No address') . ($o->deliveryDriver ? ' · driver ' . T::e($o->deliveryDriver->name) : '');
        }
        if ($o->status === 'cancelled') {
            $lines[] = '✖ Cancelled' . ($o->cancelled_at ? ' ' . $o->cancelled_at->format('g:i a') : '') . (trim((string) $o->cancellation_reason) !== '' ? ': ' . T::e((string) $o->cancellation_reason) : '');
        }

        return T::clip(implode("\n", $lines));
    }

    // ── Message staff ────────────────────────────────────────────────────

    private function tellCommand(TelegramLink $link, User $user, string $arg): void
    {
        if (!$this->can($user, 'telegram.manage')) {
            $this->c()->refuse($link);

            return;
        }
        if ($arg === '') {
            $this->askWho($link);

            return;
        }
        [$first, $rest] = array_pad(preg_split('/\s+/u', $arg, 2) ?: [], 2, '');
        $key = $this->groupKey((string) $first);
        if ($key !== null && trim($rest) !== '') {
            $this->send($link, $user, 'group:' . $key, trim($rest));

            return;
        }
        // "/tell Mariyam the float is in the safe": a person by first name.
        $person = $this->personByName((string) $first, $user);
        if ($person !== null && trim($rest) !== '') {
            $this->send($link, $user, 'user:' . $person->id, trim($rest));

            return;
        }
        $this->c()->send($link, 'Start with who it is for: <code>/tell all …</code>, <code>managers</code>, <code>cashiers</code>, <code>kitchen</code>, <code>drivers</code>, or a first name.');
    }

    private function askWho(TelegramLink $link): void
    {
        $buttons = array_map(
            fn (array $pair) => array_map(fn (string $k) => T::button(self::TELL_GROUPS[$k], 'ms:' . $k), $pair),
            array_chunk(array_keys(self::TELL_GROUPS), 3),
        );
        $this->c()->send($link, '📣 Who is it for?', [], $buttons);
    }

    private function groupKey(string $word): ?string
    {
        return match (mb_strtolower($word)) {
            'all', 'everyone', 'everybody' => 'all',
            'manager', 'managers' => 'manager',
            'staff', 'cashier', 'cashiers' => 'staff',
            'kitchen', 'cooks', 'cook' => 'kitchen_staff',
            'driver', 'drivers' => 'driver',
            default => null,
        };
    }

    private function personByName(string $name, User $sender): ?User
    {
        if (mb_strlen($name) < 2) {
            return null;
        }

        return User::query()->where('is_active', true)->where('id', '!=', $sender->id)
            ->whereRaw('LOWER(name) LIKE ?', [mb_strtolower($name) . '%'])->orderBy('name')->first();
    }

    /** @return Collection<int, TelegramLink> */
    private function targets(string $to, User $sender): Collection
    {
        $links = TelegramLink::query()->with(['bot', 'user.role', 'driver'])->whereNull('blocked_at')->get()
            ->filter(fn (TelegramLink $l) => $l->isUsable() && (int) $l->user_id !== (int) $sender->id);
        if (str_starts_with($to, 'user:')) {
            $id = (int) substr($to, 5);

            return $links->filter(fn (TelegramLink $l) => (int) $l->user_id === $id)->take(1)->values();
        }
        $role = substr($to, 6);

        return $links->filter(fn (TelegramLink $l) => $role === 'all' || $l->role() === $role)
            ->unique(fn (TelegramLink $l) => $l->user_id !== null ? 'u' . $l->user_id : 'd' . $l->delivery_driver_id)
            ->values();
    }

    private function send(TelegramLink $link, User $sender, string $to, string $message): void
    {
        $targets = $this->targets($to, $sender);
        if ($targets->isEmpty()) {
            $this->c()->send($link, 'Nobody there has linked Telegram yet.');

            return;
        }
        $html = '📣 <b>From ' . T::e($sender->name) . '</b>' . "\n" . T::e(mb_substr($message, 0, 2000));
        $reached = [];
        foreach ($targets as $t) {
            try {
                $this->client->sendMessage($t->bot, $t->chat_id, $html);
                $reached[] = $t->displayName();
            } catch (TelegramApiException $e) {
                Log::info('telegram tell: not delivered', ['link_id' => $t->id, 'error' => $e->getMessage()]);
            }
        }
        app(AuditLogService::class)->log('telegram.message_staff', 'User', $sender->id, [], ['to' => $to, 'reached' => count($reached)], ['source' => 'telegram'], $this->c()->requestAs($sender));
        $this->c()->send($link, $reached === [] ? 'Telegram would not deliver it. Try again later.' : '📣 Sent to ' . count($reached) . ': ' . T::e(implode(', ', $reached)) . '.');
    }

    // ── Buttons and replies ──────────────────────────────────────────────

    public function handleCallback(TelegramLink $link, User $user, string $callbackId, int $messageId, string $action, string $arg): bool
    {
        $answer = fn (string $text = '', bool $alert = false) => $this->client->answerCallback($link->bot, $callbackId, $text, $alert);
        switch ($action) {
            case 'mo':
                $answer();
                match ($arg) {
                    'w' => $this->working($link, $user),
                    'l' => $this->lowStock($link, $user),
                    'f' => $this->askOrder($link, $user),
                    'm' => $this->can($user, 'telegram.manage') ? $this->askWho($link) : $this->c()->refuse($link),
                    default => null,
                };

                return true;
            case 'lo':
                [$step, $id] = array_pad(explode(':', $arg, 2), 2, '0');
                $ids = $step === 'all' ? $this->lowItems()->pluck('id')->map(fn ($i) => (int) $i)->all() : [(int) $id];
                $why = $this->addToBuyingList($link, $user, $ids);
                $answer($why ?? (count($ids) > 1 ? 'Added to the buying list.' : 'Added.'), $why !== null);
                if ($why === null) {
                    $this->c()->send($link, '🛒 Added to the buying list. Approvers have it now.');
                }

                return true;
            case 'fo':
                $answer();
                $order = $this->can($user, 'orders.view') ? Order::query()->find((int) $arg) : null;
                $order ? $this->c()->send($link, $this->orderCard($order)) : $this->c()->refuse($link);

                return true;
            case 'ms':
                if (!$this->can($user, 'telegram.manage') || !isset(self::TELL_GROUPS[$arg])) {
                    $answer('Your account cannot message staff.', true);

                    return true;
                }
                $answer();
                $this->c()->awaitReply($link, ['action' => 'tell', 'to' => 'group:' . $arg]);
                $this->c()->send($link, 'Type the message for ' . T::e(mb_strtolower(self::TELL_GROUPS[$arg])) . '.');

                return true;
        }

        return false;
    }

    /** @param array<string, mixed> $await */
    public function answerAwait(TelegramLink $link, User $user, array $await, string $text): bool
    {
        if (($await['action'] ?? '') === 'find_order') {
            $this->findOrder($link, $user, $text);

            return true;
        }
        if (($await['action'] ?? '') === 'tell') {
            if (!$this->can($user, 'telegram.manage')) {
                $this->c()->refuse($link);

                return true;
            }
            $this->send($link, $user, (string) $await['to'], trim($text));

            return true;
        }

        return false;
    }

    // ── Alerts (Telegram only) ───────────────────────────────────────────

    public static function voidsOn(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(SiteSetting::get(self::SETTING_VOIDS), true);
    }

    public static function cashOn(): bool
    {
        return SmsTypeRegistry::settingIsTruthy(SiteSetting::get(self::SETTING_CASH), true);
    }

    public static function cashMin(): float
    {
        return max(0.0, (float) SiteSetting::get(self::SETTING_CASH_MIN, '0'));
    }

    /** An order cancelled by a staff member (not a customer, not an unpaid online cart). */
    public function orderCancelled(int $orderId): void
    {
        if (!self::voidsOn()) {
            return;
        }
        $o = Order::query()->with('items')->find($orderId);
        if ($o === null || $o->status !== 'cancelled' || $o->cancelled_by === null) {
            return;
        }
        $by = User::query()->find((int) $o->cancelled_by);
        $paid = O::paidSoFar($o);
        $html = '✖ <b>Order ' . O::number($o) . ' cancelled</b>' . ($by ? ' by ' . T::e($by->name) : '') . "\n"
            . T::e($this->c()->typeLabel((string) $o->type)) . ' · ' . T::mvr($o->total) . ' · ' . ($n = $o->items->whereNull('parent_order_item_id')->count()) . ($n === 1 ? ' item' : ' items')
            . ' · placed ' . ($o->created_at?->format('g:i a') ?? '') . "\n"
            . ($paid > 0 ? '💵 ' . T::mvr($paid) . ' had been paid: check it was refunded.' : 'Nothing had been paid.')
            . (trim((string) $o->cancellation_reason) !== '' ? "\nReason: " . T::e((string) $o->cancellation_reason) : '');
        $this->alert($html);
    }

    /** Cash taken out of a drawer (cash out / paid out), or a movement struck through. */
    public function cashMoved(int $movementId, bool $voided = false): void
    {
        if (!self::cashOn()) {
            return;
        }
        $m = CashMovement::query()->with(['user:id,name', 'shift.device:id,name'])->find($movementId);
        if ($m === null || !in_array((string) $m->type, ['cash_out', 'paid_out'], true) || (float) $m->amount < self::cashMin()) {
            return;
        }
        $who = T::e($m->user?->name ?? 'Someone');
        $till = $m->shift?->device?->name ? ' · ' . T::e($m->shift->device->name) : '';
        $html = $voided
            ? '↩️ <b>Cash out struck through</b>: ' . T::mvr($m->amount) . ' by ' . $who . $till . (trim((string) $m->void_reason) !== '' ? "\nWhy: " . T::e((string) $m->void_reason) : '')
            : '💵 <b>Cash out ' . T::mvr($m->amount) . '</b> by ' . $who . $till . "\n" . T::e((string) $m->reason) . ($m->category ? ' · ' . T::e(str_replace('_', ' ', (string) $m->category)) : '');
        $this->alert($html);
    }

    private function alert(string $html): void
    {
        $people = TelegramLink::query()->with(['bot', 'user.role'])->whereNotNull('user_id')->whereNull('blocked_at')->get()
            ->filter(fn (TelegramLink $l) => $l->isUsable() && $l->user !== null && SendDayReportOnLastShiftClose::receives($l))
            ->unique('user_id');
        foreach ($people as $link) {
            try {
                $this->client->sendMessage($link->bot, $link->chat_id, $html);
            } catch (TelegramApiException $e) {
                if ($e->isBlocked()) {
                    $link->forceFill(['blocked_at' => now()])->save();
                }
            } catch (Throwable $e) {
                Log::warning('telegram owner alert: skipped', ['error' => $e->getMessage()]);
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function amount(float $q, string $unit): string
    {
        $n = rtrim(rtrim(number_format($q, 2, '.', ''), '0'), '.');

        return $unit === '' || $unit === 'pcs' ? $n : $n . ' ' . $unit;
    }

    private function can(User $user, string $permission): bool
    {
        return $this->permissions->hasPermission($user, $permission);
    }

    private function c(): TelegramCommands
    {
        return app(TelegramCommands::class);
    }
}
