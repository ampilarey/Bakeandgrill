<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\InventoryItem;
use App\Models\PurchaseRequest;
use App\Models\PurchaseRequestItem;
use App\Models\TelegramBot;
use App\Models\TelegramGroup;
use App\Models\TelegramLink;
use App\Models\TelegramMessage;
use App\Models\User;
use App\Services\PurchaseRequestService;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The buying list on Telegram (owner, 2026-10-07: "Next", the cashier
 * level and the buying list). Staff type what is needed ("need 5 kg
 * onions, 2 l milk"); approvers get the request with Approve and Reject;
 * the person sent to buy gets the list with Bought / Not there per item
 * and types what they paid; the person who asked is told the decision;
 * a shop group can follow every request. Every card is kept
 * (telegram_messages) and follows the request, whichever screen moved it.
 * Each button runs the same PurchaseRequestService step as Admin, with the
 * same permission and rules.
 */
class TelegramBuyingList
{
    public const BTN = '🛒 Buying list';

    private const OPEN_FOR_BUYING = ['assigned', 'buying', 'partially_bought'];

    private const UNITS = [
        'kg' => 'kg', 'kgs' => 'kg', 'kilo' => 'kg', 'kilos' => 'kg', 'g' => 'g', 'gm' => 'g', 'grams' => 'g',
        'l' => 'l', 'ltr' => 'l', 'litre' => 'l', 'litres' => 'l', 'liter' => 'l', 'liters' => 'l', 'ml' => 'ml',
        'pc' => 'pcs', 'pcs' => 'pcs', 'piece' => 'pcs', 'pieces' => 'pcs',
        'pack' => 'pack', 'packs' => 'pack', 'pkt' => 'pack', 'pkts' => 'pack', 'packet' => 'pack', 'packets' => 'pack',
        'box' => 'box', 'boxes' => 'box', 'bottle' => 'bottle', 'bottles' => 'bottle', 'bag' => 'bag', 'bags' => 'bag',
        'can' => 'can', 'cans' => 'can', 'tin' => 'tin', 'tins' => 'tin', 'tray' => 'tray', 'trays' => 'tray',
        'roll' => 'roll', 'rolls' => 'roll', 'dozen' => 'dozen', 'bundle' => 'bundle', 'bundles' => 'bundle',
        'carton' => 'carton', 'cartons' => 'carton', 'jar' => 'jar', 'jars' => 'jar',
    ];

    /**
     * Requests with an update already queued in this request: when it was
     * queued, and the first status / buyer seen before the change.
     *
     * @var array<int, array{at: int, status: ?string, assignee: ?int, changed: bool}>
     */
    private static array $queued = [];

    public function __construct(
        private readonly TelegramClient $client,
        private readonly PermissionService $permissions,
        private readonly PurchaseRequestService $requests,
    ) {}

    public function canUse(User $user): bool
    {
        foreach (['purchase_requests.create', 'purchase_requests.view_own', 'purchase_requests.view_all', 'purchase_requests.approve'] as $p) {
            if ($this->can($user, $p)) {
                return true;
            }
        }

        return false;
    }

    // ── The list ─────────────────────────────────────────────────────────

    public function show(TelegramLink $link, User $user): void
    {
        if (!$this->canUse($user)) {
            $this->commands()->refuse($link);

            return;
        }

        $waiting = $this->can($user, 'purchase_requests.approve')
            ? PurchaseRequest::query()->where('status', 'requested')->orderBy('created_at')->limit(5)->get()
            : collect();
        $buying = PurchaseRequest::query()->where('assigned_to', $user->id)->whereIn('status', self::OPEN_FOR_BUYING)->orderBy('created_at')->limit(5)->get();
        $mine = PurchaseRequest::query()->where('requested_by', $user->id)->whereIn('status', PurchaseRequest::OPEN_STATUSES)
            ->withCount('items')->latest('id')->limit(5)->get();

        $lines = ['🛒 <b>Buying list</b>'];
        if ($mine->isNotEmpty()) {
            $lines[] = '';
            $lines[] = '<b>You asked for</b>';
            foreach ($mine as $pr) {
                $lines[] = '• ' . T::e((string) $pr->request_no) . ' · ' . $pr->items_count . ' ' . ($pr->items_count === 1 ? 'item' : 'items') . ' · ' . T::e($this->statusWord((string) $pr->status));
            }
        }
        if ($waiting->isEmpty() && $buying->isEmpty() && $mine->isEmpty()) {
            $lines[] = 'Nothing open.';
        }
        if ($this->can($user, 'purchase_requests.create')) {
            $lines[] = '';
            $lines[] = 'To add, type what is needed now, e.g. <code>5 kg onions, 2 l milk, tissue</code>. Add <code>urgent</code> if it cannot wait.';
            $this->commands()->awaitReply($link, ['action' => 'buy_add']);
        }
        $this->commands()->send($link, implode("\n", $lines));

        foreach ($waiting as $pr) {
            $this->sendCard($link->bot, $link->chat_id, $pr, 'approver', $user);
        }
        foreach ($buying as $pr) {
            $this->sendCard($link->bot, $link->chat_id, $pr, 'buyer', $user);
        }
    }

    // ── Adding ───────────────────────────────────────────────────────────

    /**
     * "5 kg onions, 2 l milk, tissue" → lines. Quantity and unit are
     * optional (1 pcs); "urgent" anywhere marks the request urgent.
     *
     * @return array{0: list<array{qty: float, unit: string, name: string}>, 1: bool}
     */
    public static function parse(string $text): array
    {
        $text = trim((string) preg_replace('/^\/?(need|buy|add)(@\w+)?\b\s*:?/iu', '', trim($text)));
        $urgent = (bool) preg_match('/\burgent\b/iu', $text);
        $text = (string) preg_replace('/\burgent\b/iu', '', $text);

        $lines = [];
        foreach (preg_split('/[,\n;]+/u', $text) ?: [] as $part) {
            $part = trim((string) preg_replace('/\s+/u', ' ', $part), " .-\t");
            if ($part === '') {
                continue;
            }
            $qty = 1.0;
            $unit = 'pcs';
            if (preg_match('/^(\d+(?:[.,]\d+)?)\s*([a-z]+)?\s+(.+)$/iu', $part, $m) || preg_match('/^(\d+(?:[.,]\d+)?)([a-z]+)\s+(.+)$/iu', $part, $m)) {
                $qty = (float) str_replace(',', '.', $m[1]);
                $word = strtolower($m[2] ?? '');
                if ($word !== '' && isset(self::UNITS[$word])) {
                    $unit = self::UNITS[$word];
                    $part = $m[3];
                } else {
                    $part = trim(($m[2] ?? '') . ' ' . $m[3]);
                }
            }
            if ($qty <= 0 || mb_strlen($part) < 2) {
                continue;
            }
            $lines[] = ['qty' => $qty, 'unit' => $unit, 'name' => mb_substr($part, 0, 120)];
        }

        return [array_slice($lines, 0, 20), $urgent];
    }

    public function add(TelegramLink $link, User $user, string $text): bool
    {
        if (!$this->can($user, 'purchase_requests.create')) {
            $this->commands()->refuse($link);

            return true;
        }
        [$lines, $urgent] = self::parse($text);
        if ($lines === []) {
            $this->commands()->send($link, 'Type what is needed, e.g. <code>5 kg onions, 2 l milk</code>.');

            return true;
        }

        $items = [];
        foreach ($lines as $line) {
            $inventory = InventoryItem::query()->where('is_active', true)->whereRaw('LOWER(name) = ?', [mb_strtolower($line['name'])])->first(['id', 'unit']);
            $items[] = [
                'inventory_item_id' => $inventory?->id,
                'free_text_name' => $inventory ? null : $line['name'],
                'requested_qty' => $line['qty'],
                'requested_unit' => $inventory && $line['unit'] === 'pcs' && (string) $inventory->unit !== '' ? (string) $inventory->unit : $line['unit'],
                'reason' => $urgent ? 'urgent_order' : null,
            ];
        }

        try {
            $pr = $this->requests->create($user, ['source' => 'telegram', 'priority' => $urgent ? 'urgent' : 'normal'], $items, $this->commands()->requestAs($user));
        } catch (ValidationException $e) {
            $this->commands()->send($link, T::e($this->firstError($e)));

            return true;
        }

        $this->sendCard($link->bot, $link->chat_id, $pr, 'requester', $user, '➕ <b>Added.</b> ');

        return true;
    }

    // ── Cards ────────────────────────────────────────────────────────────

    /**
     * @param string $kind approver | buyer | group | requester
     * @return array{0: string, 1: array<int, array<int, array<string, string>>>}
     */
    public function card(PurchaseRequest $pr, string $kind, ?string $prefix = null): array
    {
        $pr->loadMissing(['items.inventoryItem', 'requester:id,name', 'approver:id,name', 'assignee:id,name', 'rejector:id,name']);
        $head = ($prefix ?? '') . '🛒 <b>Buying list ' . T::e((string) $pr->request_no) . '</b>' . ($pr->priority === 'urgent' ? ' · ⚡ Urgent' : '');
        $lines = [$head];
        $lines[] = 'Asked by ' . T::e($pr->requester?->name ?? 'staff') . ', ' . T::agoPhrase($pr->created_at)
            . ($pr->needed_by ? ' · needed by ' . $pr->needed_by->format('D j M') : '');
        $lines[] = '';
        $decided = !in_array((string) $pr->status, ['requested', 'approved'], true);
        foreach ($pr->items->sortBy('id') as $item) {
            $lines[] = $this->itemLine($item, $decided);
        }
        if ((int) $pr->total_estimated_laar > 0) {
            $lines[] = 'Estimated ' . T::mvr((int) $pr->total_estimated_laar / 100);
        }
        if ((int) $pr->total_actual_laar > 0) {
            $lines[] = 'Paid so far ' . T::mvr((int) $pr->total_actual_laar / 100);
        }
        if (trim((string) $pr->notes) !== '') {
            $lines[] = '📝 ' . T::e(trim((string) $pr->notes));
        }
        $lines[] = '';
        $lines[] = $this->statusLine($pr);

        return [T::clip(implode("\n", $lines)), $this->buttons($pr, $kind)];
    }

    private function itemLine(PurchaseRequestItem $item, bool $showState): string
    {
        $qty = (float) ($item->approved_qty ?? $item->requested_qty);
        $q = rtrim(rtrim(number_format($qty, 3, '.', ''), '0'), '.');
        $unit = (string) $item->requested_unit;
        $amount = match (true) {
            $unit === 'pcs' || $unit === '' => $qty == 1.0 ? '' : $q . ' ',
            in_array($unit, ['kg', 'g', 'l', 'ml', 'dozen'], true) || $qty == 1.0 => $q . ' ' . $unit . ' ',
            default => $q . ' ' . (str_ends_with($unit, 'x') ? $unit . 'es' : $unit . 's') . ' ',
        };
        $line = '• ' . T::e($amount) . T::e($item->displayName());
        if (!$showState) {
            return $line;
        }

        return $line . match ((string) $item->status) {
            'bought', 'received' => ' ✅' . ((int) $item->actual_total_laar > 0 ? ' ' . T::mvr((int) $item->actual_total_laar / 100) : ''),
            'partially_bought' => ' ◐ part',
            'not_available' => ' ❌ not there',
            'cancelled' => ' ✖',
            default => '',
        };
    }

    private function statusLine(PurchaseRequest $pr): string
    {
        $who = fn (?User $u) => $u ? ' by ' . T::e($u->name) : '';

        return match ((string) $pr->status) {
            'requested' => '⏳ <b>Waiting for approval</b>',
            'approved' => '✅ <b>Approved</b>' . $who($pr->approver) . ' · nobody sent to buy yet',
            'assigned', 'buying', 'partially_bought' => '🛍 <b>Buying</b>: ' . T::e($pr->assignee?->name ?? 'someone'),
            'bought_pending_verification' => '📦 <b>Bought</b>, waiting to be checked in',
            'received', 'closed' => '🏁 <b>Done</b>',
            'rejected' => '✖ <b>Rejected</b>' . $who($pr->rejector) . (trim((string) $pr->rejection_reason) !== '' ? ': ' . T::e((string) $pr->rejection_reason) : ''),
            'cancelled' => '✖ <b>Cancelled</b>',
            default => '<b>' . T::e($this->statusWord((string) $pr->status)) . '</b>',
        };
    }

    /** @return array<int, array<int, array<string, string>>> */
    private function buttons(PurchaseRequest $pr, string $kind): array
    {
        if (in_array($kind, ['approver', 'group'], true) && $pr->status === 'requested') {
            $p = $kind === 'group' ? 'gb' : 'bl';

            return [[T::button('✅ Approve', $p . ':a:' . $pr->id), T::button('✖ Reject', $p . ':r:' . $pr->id)]];
        }
        if ($kind === 'buyer' && in_array((string) $pr->status, self::OPEN_FOR_BUYING, true)) {
            $rows = [];
            foreach ($pr->items->sortBy('id') as $item) {
                if (in_array((string) $item->status, ['approved', 'assigned', 'pending'], true)) {
                    $rows[] = [
                        T::button('✅ ' . mb_substr($item->displayName(), 0, 24) . ' bought', 'bl:b:' . $item->id),
                        T::button('✖ Not there', 'bl:n:' . $item->id),
                    ];
                }
            }

            return $rows;
        }

        return [];
    }

    public function statusWord(string $status): string
    {
        return match ($status) {
            'requested' => 'waiting for approval',
            'approved' => 'approved',
            'assigned', 'buying' => 'being bought',
            'partially_bought' => 'part bought',
            'bought_pending_verification' => 'bought, to check in',
            'received', 'closed' => 'done',
            default => str_replace('_', ' ', $status),
        };
    }

    // ── Who hears about it ───────────────────────────────────────────────

    /** A new request: approvers get it with buttons, and the groups that follow the buying list. */
    public function created(int $requestId): void
    {
        $pr = PurchaseRequest::query()->find($requestId);
        if ($pr === null) {
            return;
        }
        if ($pr->status === 'requested') {
            foreach ($this->approverLinks($pr) as $link) {
                $this->sendCard($link->bot, $link->chat_id, $pr, 'approver', $link->user);
            }
        }
        foreach ($this->groups() as $group) {
            $this->sendCard($group->bot, $group->chat_id, $pr, 'group', null, null, $group);
        }
    }

    /**
     * Something changed (status or buyer): every kept card is redrawn; the
     * person who asked hears the decision; a new buyer gets the list.
     */
    public function changed(int $requestId, ?string $oldStatus, ?int $oldAssignee): void
    {
        $pr = PurchaseRequest::query()->find($requestId);
        if ($pr === null) {
            return;
        }
        $this->refresh($pr);

        if ($oldStatus !== null && $oldStatus !== $pr->status && in_array($pr->status, ['approved', 'rejected'], true)) {
            $actor = $pr->status === 'approved' ? $pr->approved_by : $pr->rejected_by;
            if ($pr->requested_by !== null && (int) $pr->requested_by !== (int) $actor) {
                $pr->loadMissing(['approver:id,name', 'rejector:id,name']);
                $text = $pr->status === 'approved'
                    ? '✅ Your buying list ' . T::e((string) $pr->request_no) . ' was approved' . ($pr->approver ? ' by ' . T::e($pr->approver->name) : '') . '.'
                    : '✖ Your buying list ' . T::e((string) $pr->request_no) . ' was rejected' . ($pr->rejector ? ' by ' . T::e($pr->rejector->name) : '')
                        . (trim((string) $pr->rejection_reason) !== '' ? ': ' . T::e((string) $pr->rejection_reason) : '.');
                foreach ($this->userLinks((int) $pr->requested_by) as $link) {
                    $this->trySend($link->bot, $link->chat_id, $text);
                }
            }
        }

        if ($pr->assigned_to !== null && (int) $pr->assigned_to !== (int) $oldAssignee && in_array((string) $pr->status, self::OPEN_FOR_BUYING, true)) {
            foreach ($this->userLinks((int) $pr->assigned_to) as $link) {
                $already = TelegramMessage::query()->where('subject', TelegramMessage::SUBJECT_PURCHASE_REQUEST)->where('subject_id', $pr->id)
                    ->where('kind', 'buyer')->where('chat_id', $link->chat_id)->exists();
                if (!$already) {
                    $this->sendCard($link->bot, $link->chat_id, $pr, 'buyer', $link->user, '🛍 <b>You are buying this.</b> Tap each item when you have it.' . "\n\n");
                }
            }
        }
    }

    /**
     * Called from the models: redraw once per request, after the response.
     * $changed is false for an item change, which only redraws the cards.
     */
    public static function queue(int $requestId, ?string $oldStatus, ?int $oldAssignee, bool $changed = true): void
    {
        $entry = self::$queued[$requestId] ?? null;
        // A stale entry (deferred work that never ran in a long-lived worker) is replaced.
        if ($entry !== null && time() - $entry['at'] < 60) {
            if ($changed && !$entry['changed']) {
                self::$queued[$requestId] = ['at' => $entry['at'], 'status' => $oldStatus, 'assignee' => $oldAssignee, 'changed' => true];
            }

            return;
        }
        self::$queued[$requestId] = ['at' => time(), 'status' => $oldStatus, 'assignee' => $oldAssignee, 'changed' => $changed];
        DeferAfterResponse::run(static function () use ($requestId): void {
            $entry = self::$queued[$requestId] ?? null;
            unset(self::$queued[$requestId]);
            if ($entry === null) {
                return;
            }
            try {
                $entry['changed']
                    ? app(self::class)->changed($requestId, $entry['status'], $entry['assignee'])
                    : app(self::class)->refreshById($requestId);
            } catch (Throwable $e) {
                Log::warning('telegram buying list: update skipped', ['request_id' => $requestId, 'error' => $e->getMessage()]);
            }
        }, 'telegram-buying-list');
    }

    public function refreshById(int $requestId): void
    {
        $pr = PurchaseRequest::query()->find($requestId);
        if ($pr !== null) {
            $this->refresh($pr);
        }
    }

    public function refresh(PurchaseRequest $pr): void
    {
        $messages = TelegramMessage::query()->with('bot')->where('subject', TelegramMessage::SUBJECT_PURCHASE_REQUEST)->where('subject_id', $pr->id)->get();
        foreach ($messages as $m) {
            if ($m->bot === null || !$m->bot->is_enabled) {
                continue;
            }
            [$html, $buttons] = $this->card($pr->fresh() ?? $pr, (string) $m->kind);
            try {
                $this->client->editMessage($m->bot, $m->chat_id, $m->message_id, $html, $buttons);
            } catch (TelegramApiException $e) {
                Log::info('telegram buying list: card not updated', ['message' => $m->id, 'error' => $e->getMessage()]);
            }
        }
    }

    // ── Buttons ──────────────────────────────────────────────────────────

    /** A button in a private chat: bl:a / bl:r (request), bl:b / bl:n (item). */
    public function privateTap(TelegramLink $link, User $user, string $callbackId, int $messageId, string $arg): void
    {
        [$step, $id] = array_pad(explode(':', $arg, 2), 2, '0');
        $answer = fn (string $text = '', bool $alert = false) => $this->client->answerCallback($link->bot, $callbackId, $text, $alert);

        if ($step === 'a' || $step === 'r') {
            $pr = PurchaseRequest::query()->find((int) $id);
            if ($pr === null) {
                $answer('That request is gone.', true);

                return;
            }
            if ($step === 'a') {
                $result = $this->approve($pr, $user);
                $answer($result === null ? 'Approved.' : $result, $result !== null);
                $this->editCard($link, $messageId, $pr, 'approver');

                return;
            }
            if (!$this->can($user, 'purchase_requests.reject')) {
                $answer('Your account cannot reject requests.', true);

                return;
            }
            $answer();
            $this->commands()->awaitReply($link, ['action' => 'buy_reject', 'id' => $pr->id, 'message_id' => $messageId]);
            $this->commands()->send($link, 'Why is ' . T::e((string) $pr->request_no) . ' rejected? Type the reason (the person who asked sees it).');

            return;
        }

        $item = PurchaseRequestItem::query()->with('purchaseRequest')->find((int) $id);
        if ($item === null || $item->purchaseRequest === null) {
            $answer('That item is gone.', true);

            return;
        }
        if (!$this->can($user, 'purchase_requests.buy')) {
            $answer('Your account cannot buy for the shop.', true);

            return;
        }
        if ($step === 'n') {
            try {
                $this->requests->markNotAvailable($item, $user, 'Not there (Telegram)', $this->commands()->requestAs($user));
            } catch (ValidationException $e) {
                $answer($this->firstError($e), true);

                return;
            }
            $answer('Marked not there.');
            $this->editCard($link, $messageId, $item->purchaseRequest, 'buyer');

            return;
        }
        if ($step === 'b') {
            try {
                $this->requests->assertCanBuy($item, $user);
            } catch (ValidationException $e) {
                $answer($this->firstError($e), true);

                return;
            }
            $answer();
            $this->commands()->awaitReply($link, ['action' => 'buy_paid', 'id' => $item->id, 'message_id' => $messageId]);
            $this->commands()->send($link, 'What did you pay for ' . T::e($item->displayName()) . ' in total? Type the amount, e.g. <code>120</code>, or <code>-</code> if you have no bill.');

            return;
        }
        $answer('This button is no longer used.');
    }

    /** A button on a group card: gb:a / gb:r. The presser is checked like in Admin. */
    public function groupTap(TelegramBot $bot, array $callback, ?User $user): void
    {
        $callbackId = (string) ($callback['id'] ?? '');
        [, $step, $id] = array_pad(explode(':', (string) ($callback['data'] ?? ''), 3), 3, '0');
        $pr = PurchaseRequest::query()->find((int) $id);
        if ($pr === null) {
            $this->client->answerCallback($bot, $callbackId, 'That request is gone.', true);

            return;
        }
        if ($user === null) {
            $this->client->answerCallback($bot, $callbackId, 'Link your own Telegram first: ask the owner for your link (Admin → Telegram).', true);

            return;
        }
        if ($step === 'a') {
            $result = $this->approve($pr, $user);
            $this->client->answerCallback($bot, $callbackId, $result ?? 'Approved.', $result !== null);
        } elseif ($step === 'r') {
            if (!$this->can($user, 'purchase_requests.reject')) {
                $this->client->answerCallback($bot, $callbackId, 'Your account cannot reject requests.', true);

                return;
            }
            try {
                $this->requests->reject($pr, $user, null, $this->commands()->requestAs($user));
                $this->client->answerCallback($bot, $callbackId, 'Rejected.');
            } catch (ValidationException $e) {
                $this->client->answerCallback($bot, $callbackId, $this->firstError($e), true);
            }
        } else {
            $this->client->answerCallback($bot, $callbackId, 'This button is no longer used.');

            return;
        }
        $this->refresh($pr->fresh() ?? $pr);
    }

    /** @return string|null why not, or null when approved */
    private function approve(PurchaseRequest $pr, User $user): ?string
    {
        if (!$this->can($user, 'purchase_requests.approve')) {
            return 'Your account cannot approve requests.';
        }
        $user->loadMissing('role');
        try {
            $this->requests->approve($pr, $user, $this->commands()->requestAs($user));
        } catch (ValidationException $e) {
            return $this->firstError($e);
        }

        return null;
    }

    // ── Replies the bot asked for ────────────────────────────────────────

    /** @param array<string, mixed> $await */
    public function answerAwait(TelegramLink $link, User $user, array $await, string $text): bool
    {
        switch ($await['action'] ?? '') {
            case 'buy_add':
                return $this->add($link, $user, $text);
            case 'buy_reject':
                $pr = PurchaseRequest::query()->find((int) ($await['id'] ?? 0));
                if ($pr === null || !$this->can($user, 'purchase_requests.reject')) {
                    $this->commands()->send($link, 'That request can no longer be decided here.');

                    return true;
                }
                try {
                    $this->requests->reject($pr, $user, mb_substr(trim($text), 0, 500), $this->commands()->requestAs($user));
                } catch (ValidationException $e) {
                    $this->commands()->send($link, T::e($this->firstError($e)));

                    return true;
                }
                $this->editCard($link, (int) ($await['message_id'] ?? 0), $pr, 'approver');
                $this->commands()->send($link, '✖ Rejected. The person who asked is told why.');

                return true;
            case 'buy_paid':
                $item = PurchaseRequestItem::query()->with('purchaseRequest')->find((int) ($await['id'] ?? 0));
                if ($item === null || !$this->can($user, 'purchase_requests.buy')) {
                    $this->commands()->send($link, 'That item can no longer be marked here.');

                    return true;
                }
                $raw = trim(str_ireplace(['mvr', 'rf'], '', $text));
                $paid = null;
                if ($raw !== '-' && $raw !== '') {
                    if (!preg_match('/^\d+(?:[.,]\d{1,2})?$/', $raw)) {
                        $this->commands()->awaitReply($link, $await);
                        $this->commands()->send($link, 'Just the amount, e.g. <code>120</code> or <code>45.50</code>, or <code>-</code>.');

                        return true;
                    }
                    $paid = (float) str_replace(',', '.', $raw);
                }
                $qty = (float) ($item->approved_qty ?? $item->requested_qty);
                $data = $paid !== null && $qty > 0 ? ['actual_unit_cost_laar' => (int) round($paid * 100 / $qty)] : [];
                try {
                    $this->requests->markBought($item, $user, $data, $this->commands()->requestAs($user));
                } catch (ValidationException $e) {
                    $this->commands()->send($link, T::e($this->firstError($e)));

                    return true;
                }
                $this->editCard($link, (int) ($await['message_id'] ?? 0), $item->purchaseRequest, 'buyer');
                $this->commands()->send($link, '✅ ' . T::e($item->displayName()) . ' bought' . ($paid !== null ? ', ' . T::mvr($paid) : ', no price') . '.');

                return true;
        }

        return false;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function editCard(TelegramLink $link, int $messageId, PurchaseRequest $pr, string $kind): void
    {
        if ($messageId <= 0) {
            return;
        }
        [$html, $buttons] = $this->card($pr->fresh() ?? $pr, $kind);
        try {
            $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);
        } catch (TelegramApiException) {
            // An old card may not be editable; the reply already said what happened.
        }
    }

    private function sendCard(TelegramBot $bot, string $chatId, PurchaseRequest $pr, string $kind, ?User $user, ?string $prefix = null, ?TelegramGroup $group = null): void
    {
        [$html, $buttons] = $this->card($pr, $kind, $prefix);
        try {
            $sent = $this->client->sendMessage($bot, $chatId, $html, $buttons);
        } catch (TelegramApiException $e) {
            if ($group !== null && ($e->isBlocked() || str_contains($e->getMessage(), 'chat not found'))) {
                $group->forceFill(['is_enabled' => false, 'last_error' => mb_substr($e->getMessage(), 0, 500)])->save();
            }
            Log::info('telegram buying list: not delivered', ['chat' => $chatId, 'error' => $e->getMessage()]);

            return;
        }
        TelegramMessage::query()->create([
            'telegram_bot_id' => $bot->id,
            'chat_id' => $chatId,
            'message_id' => (int) ($sent['message_id'] ?? 0),
            'subject' => TelegramMessage::SUBJECT_PURCHASE_REQUEST,
            'subject_id' => $pr->id,
            'kind' => $kind === 'requester' ? 'requester' : $kind,
            'user_id' => $user?->id,
        ]);
        $group?->forceFill(['last_posted_at' => now(), 'last_error' => null])->save();
    }

    private function trySend(TelegramBot $bot, string $chatId, string $html): void
    {
        try {
            $this->client->sendMessage($bot, $chatId, $html);
        } catch (TelegramApiException $e) {
            Log::info('telegram buying list: not delivered', ['chat' => $chatId, 'error' => $e->getMessage()]);
        }
    }

    /** Linked staff who may approve it; the person who asked only when owner or manager (the service's rule). */
    private function approverLinks(PurchaseRequest $pr): Collection
    {
        return TelegramLink::query()->with(['bot', 'user.role'])->whereNotNull('user_id')->whereNull('blocked_at')->get()
            ->filter(fn (TelegramLink $l) => $l->isUsable() && $l->user !== null
                && $this->can($l->user, 'purchase_requests.approve')
                && ((int) $l->user_id !== (int) $pr->requested_by || in_array($l->role(), ['owner', 'manager'], true)))
            ->unique('user_id')
            ->values();
    }

    private function userLinks(int $userId): Collection
    {
        return TelegramLink::query()->with(['bot', 'user.role'])->where('user_id', $userId)->whereNull('blocked_at')->get()
            ->filter(fn (TelegramLink $l) => $l->isUsable())
            ->take(1);
    }

    /** @return Collection<int, TelegramGroup> */
    private function groups(): Collection
    {
        return TelegramGroup::query()->with('bot')->where('is_enabled', true)->get()
            ->filter(fn (TelegramGroup $g) => $g->isLive(TelegramGroup::FEED_BUYING_LIST))
            ->values();
    }

    private function firstError(ValidationException $e): string
    {
        return (string) (collect($e->errors())->flatten()->first() ?? $e->getMessage());
    }

    private function can(User $user, string $permission): bool
    {
        return $this->permissions->hasPermission($user, $permission);
    }

    private function commands(): TelegramCommands
    {
        return app(TelegramCommands::class);
    }
}
