<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Services;

use App\Domains\Kitchen\Services\ProductionTasks;
use App\Domains\KitchenDisplay\Support\KitchenBoard;
use App\Domains\Permissions\Services\PermissionService;
use App\Domains\Telegram\Exceptions\TelegramApiException;
use App\Domains\Telegram\Support\TelegramText as T;
use App\Models\Order;
use App\Models\ProductionPlanRecord;
use App\Models\PurchaseRequestItem;
use App\Models\TelegramLink;
use App\Models\User;
use App\Services\PurchaseRequestVerificationService;
use App\Support\DeferAfterResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The kitchen level (owner, 2026-10-07: "Next"). For a cook, or anyone with
 * the same permissions:
 *  - 📋 Prep list: today's production plan jobs, their own first, with
 *    "Made" that sends a prepared-stock
 *    batch to the counter exactly as the kitchen screen does
 *    (ProductionTasks::made). Saving a plan tells each person their jobs.
 *  - 🍳 Kitchen: what is on the board now, read only. Start and Done stay
 *    on the kitchen screen, whose routes need an approved device.
 *  - 📦 To check in: bought buying-list items waiting at the back door,
 *    with Received (PurchaseRequestVerificationService, which refuses the
 *    person who bought it and puts the stock in).
 */
class TelegramKitchenDesk
{
    public const BTN_PREP = '📋 Prep list';
    public const BTN_QUEUE = '🍳 Kitchen';
    public const BTN_CHECKIN = '📦 To check in';

    /** @var array<string, int> user:date pairs with a "your jobs" message queued */
    private static array $queued = [];

    public function __construct(
        private readonly TelegramClient $client,
        private readonly PermissionService $permissions,
        private readonly ProductionTasks $tasks,
    ) {}

    /** @return list<string> */
    public function menuButtons(User $user): array
    {
        $b = [];
        if ($this->canSeePrep($user)) {
            $b[] = self::BTN_PREP;
        }
        if ($this->can($user, 'kds.view')) {
            $b[] = self::BTN_QUEUE;
        }
        if ($this->can($user, 'purchase_requests.receive')) {
            $b[] = self::BTN_CHECKIN;
        }

        return $b;
    }

    /** @return list<string> */
    public function helpLines(User $user): array
    {
        $lines = [];
        if ($this->canSeePrep($user)) {
            $lines[] = '<b>' . self::BTN_PREP . '</b>: today\'s jobs from the production plan, with Made (it goes to the counter like on the kitchen screen). <code>/prep tomorrow</code> for tomorrow.';
        }
        if ($this->can($user, 'kds.view')) {
            $lines[] = '<b>' . self::BTN_QUEUE . '</b>: what is on the kitchen board now and how long the oldest has waited.';
        }
        if ($this->can($user, 'purchase_requests.receive')) {
            $lines[] = '<b>' . self::BTN_CHECKIN . '</b>: bought items waiting to be checked in, with Received.';
        }

        return $lines;
    }

    public function handleText(TelegramLink $link, User $user, string $raw, ?string $command): bool
    {
        if ($raw === self::BTN_PREP || $command === 'prep') {
            $this->prepList($link, $user, preg_match('/\btomorrow\b/i', $raw) ? now()->addDay() : now());

            return true;
        }
        if ($raw === self::BTN_QUEUE || $command === 'kitchen') {
            $this->queue($link, $user);

            return true;
        }
        if ($raw === self::BTN_CHECKIN || $command === 'checkin') {
            $this->toCheckIn($link, $user);

            return true;
        }

        return false;
    }

    // ── Prep list ────────────────────────────────────────────────────────

    public function prepList(TelegramLink $link, User $user, Carbon $day): void
    {
        if (!$this->canSeePrep($user)) {
            $this->commands()->refuse($link);

            return;
        }
        // The whole kitchen's list (cooks may see the plan), their own jobs first.
        $all = $this->tasks->forDate($day->toDateString())['tasks'];
        $uid = (int) $user->id;
        usort($all, fn (array $a, array $b) => (int) ($b['assigned_to'] === $uid) <=> (int) ($a['assigned_to'] === $uid));
        $mine = $all;
        $yours = count(array_filter($all, fn (array $t) => $t['assigned_to'] === $uid));
        $label = $day->isToday() ? 'Today' : $day->format('D j M');
        if ($mine === []) {
            $this->commands()->send($link, '📋 <b>' . $label . ': no jobs.</b>' . ($day->isToday() ? "\n<code>/prep tomorrow</code> for tomorrow." : ''));

            return;
        }

        $open = array_values(array_filter($mine, fn (array $t) => in_array($t['status'], ['todo', 'partial'], true)));
        $done = array_values(array_filter($mine, fn (array $t) => !in_array($t['status'], ['todo', 'partial'], true)));
        $lines = ['📋 <b>' . $label . '</b> · ' . count($mine) . ' ' . (count($mine) === 1 ? 'job' : 'jobs') . ($yours > 0 ? ' (' . $yours . ' yours)' : '') . ', ' . count($done) . ' done'];
        foreach ($done as $t) {
            $lines[] = '✅ ' . T::e($t['name']) . ' · ' . $this->qty($t['made_qty']) . ($t['status'] === 'received' ? ', at the counter' : ', sent');
        }
        $this->commands()->send($link, implode("\n", $lines));

        $canMake = $day->isToday() && $this->canMake($user);
        foreach (array_slice($open, 0, 10) as $t) {
            [$html, $buttons] = $this->taskCard($t, $canMake);
            $this->commands()->send($link, $html, [], $buttons);
        }
        if (count($open) > 10) {
            $this->commands()->send($link, '…and ' . (count($open) - 10) . ' more on the kitchen screen.');
        }
    }

    /**
     * @param array<string, mixed> $t a ProductionTasks task
     * @return array{0: string, 1: array<int, array<int, array<string, string>>>}
     */
    public function taskCard(array $t, bool $canMake, ?string $note = null): array
    {
        $when = $t['due_time'] ? 'by ' . Carbon::createFromFormat('H:i', (string) $t['due_time'])->format('g:i a') : 'slot ' . $t['slot_label'];
        $lines = ['📋 <b>' . T::e($t['name']) . '</b> · ' . $this->qty($t['remaining']) . ' to make · ' . T::e($when)];
        $lines[] = 'Planned ' . $this->qty($t['planned_qty']) . ((float) $t['made_qty'] > 0 ? ' · made ' . $this->qty($t['made_qty']) . ($t['made_by_name'] ? ' (' . T::e($t['made_by_name']) . ')' : '') : '')
            . ($t['assigned_name'] ? ' · for ' . T::e($t['assigned_name']) : '');
        if (!empty($t['instructions'])) {
            $lines[] = '<i>' . T::e(mb_strimwidth((string) $t['instructions'], 0, 300, '…')) . '</i>';
        }
        if ($note !== null) {
            $lines[] = '';
            $lines[] = $note;
        }
        $buttons = [];
        if ($canMake && (float) $t['remaining'] > 0) {
            $buttons[] = [
                T::button('✅ Made ' . $this->qty($t['remaining']), 'kp:a:' . $t['id']),
                T::button('✏️ Other amount', 'kp:o:' . $t['id']),
            ];
        }

        return [implode("\n", $lines), $buttons];
    }

    private function made(TelegramLink $link, User $user, int $recordId, float $qty, int $messageId): ?string
    {
        $record = ProductionPlanRecord::query()->find($recordId);
        if ($record === null || !Carbon::parse($record->plan_date)->isToday()) {
            return 'That job is not on today\'s list.';
        }
        try {
            $result = $this->tasks->made($record, $user, $qty, 'Telegram', $this->commands()->requestAs($user));
        } catch (ValidationException $e) {
            return (string) (collect($e->errors())->flatten()->first() ?? $e->getMessage());
        }
        $task = $result['task'];
        if ($messageId > 0 && $task !== []) {
            [$html, $buttons] = $this->taskCard($task, true, '✅ <b>' . $this->qty($qty) . ' made</b> by ' . T::e($user->name) . ', sent to the counter.');
            try {
                $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);
            } catch (TelegramApiException) {
                // The confirmation below is enough.
            }
        }

        return null;
    }

    /**
     * Saving a plan with a person on a job tells them (once per person and
     * day per request), with the day's jobs.
     */
    public static function queueJobs(int $userId, string $date): void
    {
        $key = $userId . ':' . $date;
        if (isset(self::$queued[$key]) && time() - self::$queued[$key] < 60) {
            return;
        }
        self::$queued[$key] = time();
        DeferAfterResponse::run(static function () use ($key, $userId, $date): void {
            unset(self::$queued[$key]);
            try {
                app(self::class)->tellJobs($userId, $date);
            } catch (Throwable $e) {
                Log::warning('telegram kitchen: jobs message skipped', ['user_id' => $userId, 'error' => $e->getMessage()]);
            }
        }, 'telegram-kitchen-jobs');
    }

    public function tellJobs(int $userId, string $date): void
    {
        $day = Carbon::parse($date);
        if ($day->lt(today())) {
            return;
        }
        $jobs = array_values(array_filter($this->tasks->forDate($date)['tasks'], fn (array $t) => $t['assigned_to'] === $userId && in_array($t['status'], ['todo', 'partial'], true)));
        if ($jobs === []) {
            return;
        }
        $link = TelegramLink::query()->with(['bot', 'user.role'])->where('user_id', $userId)->whereNull('blocked_at')->get()->first(fn (TelegramLink $l) => $l->isUsable());
        if ($link === null) {
            return;
        }
        $lines = ['📋 <b>Your jobs for ' . ($day->isToday() ? 'today' : ($day->isTomorrow() ? 'tomorrow, ' . $day->format('D j M') : $day->format('D j M'))) . '</b>'];
        foreach ($jobs as $t) {
            $lines[] = '• ' . T::e($t['name']) . ' · ' . $this->qty($t['remaining'])
                . ($t['due_time'] ? ' by ' . Carbon::createFromFormat('H:i', (string) $t['due_time'])->format('g:i a') : ' (' . T::e($t['slot_label']) . ')');
        }
        $lines[] = '';
        $lines[] = 'On the day, tap <b>' . self::BTN_PREP . '</b> and press Made as each goes to the counter.';
        try {
            $this->client->sendMessage($link->bot, $link->chat_id, implode("\n", $lines));
        } catch (TelegramApiException $e) {
            Log::info('telegram kitchen: jobs not delivered', ['user_id' => $userId, 'error' => $e->getMessage()]);
        }
    }

    // ── Kitchen board ────────────────────────────────────────────────────

    public function queue(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'kds.view')) {
            $this->commands()->refuse($link);

            return;
        }
        $orders = KitchenBoard::visible(Order::query()->withCount('items'))->get();
        $lanes = $orders->groupBy(fn (Order $o) => KitchenBoard::lane($o));
        $later = KitchenBoard::laterTodayCount();
        $counts = [
            count($lanes->get('new', [])) . ' to start',
            count($lanes->get('cooking', [])) . ' cooking',
            count($lanes->get('ready', [])) . ' ready',
        ];
        if ($later > 0) {
            $counts[] = $later . ' later today';
        }
        $lines = ['🍳 <b>Kitchen now</b> · ' . implode(' · ', $counts)];
        if ($orders->isEmpty()) {
            $lines[] = 'Nothing on the board.';
            $this->commands()->send($link, implode("\n", $lines));

            return;
        }

        $sorted = $orders->filter(fn (Order $o) => KitchenBoard::lane($o) !== 'ready')
            ->sortBy(fn (Order $o) => KitchenBoard::clockAt($o)->getTimestamp())->values();
        if ($sorted->isNotEmpty()) {
            $oldest = KitchenBoard::clockAt($sorted->first());
            $lines[] = 'Oldest waiting ' . T::ago($oldest) . '.';
            $lines[] = '';
            foreach ($sorted->take(12) as $o) {
                $lane = KitchenBoard::lane($o);
                $lines[] = ($lane === 'cooking' ? '👨‍🍳' : '🆕') . ' <b>#' . T::e((string) ($o->order_number ?? $o->id)) . '</b> · ' . T::ago(KitchenBoard::clockAt($o))
                    . ' · ' . (int) $o->items_count . ' ' . ((int) $o->items_count === 1 ? 'item' : 'items')
                    . ' · ' . T::e($this->commands()->typeLabel((string) $o->type));
            }
            if ($sorted->count() > 12) {
                $lines[] = '…and ' . ($sorted->count() - 12) . ' more.';
            }
        }
        $lines[] = '';
        $lines[] = '<i>Start and Done stay on the kitchen screen.</i>';
        $this->commands()->send($link, T::clip(implode("\n", $lines)));
    }

    // ── Check in ─────────────────────────────────────────────────────────

    public function toCheckIn(TelegramLink $link, User $user): void
    {
        if (!$this->can($user, 'purchase_requests.receive')) {
            $this->commands()->refuse($link);

            return;
        }
        $items = PurchaseRequestItem::query()
            ->with(['purchaseRequest:id,request_no,status', 'buyer:id,name'])
            ->whereIn('status', ['bought', 'partially_bought'])
            ->whereHas('purchaseRequest', fn ($q) => $q->whereNotIn('status', ['closed', 'rejected', 'cancelled']))
            ->orderBy('bought_at')
            ->limit(15)
            ->get();
        if ($items->isEmpty()) {
            $this->commands()->send($link, '📦 <b>Nothing waiting to be checked in.</b>');

            return;
        }
        $this->commands()->send($link, '📦 <b>To check in</b> (' . $items->count() . '). You cannot check in what you bought yourself.');
        foreach ($items as $item) {
            [$html, $buttons] = $this->checkInCard($item, $user);
            $this->commands()->send($link, $html, [], $buttons);
        }
    }

    /** @return array{0: string, 1: array<int, array<int, array<string, string>>>} */
    public function checkInCard(PurchaseRequestItem $item, User $viewer, ?string $note = null): array
    {
        $qty = rtrim(rtrim(number_format((float) ($item->actual_qty ?? $item->approved_qty ?? $item->requested_qty), 3, '.', ''), '0'), '.');
        $unit = (string) ($item->actual_unit ?: $item->requested_unit);
        $lines = ['📦 <b>' . T::e(($unit === 'pcs' ? $qty . ' × ' : $qty . ' ' . $unit . ' ') . $item->displayName()) . '</b>'];
        $lines[] = 'Bought by ' . T::e($item->buyer?->name ?? 'someone') . ($item->bought_at ? ', ' . T::agoPhrase($item->bought_at) : '')
            . ((int) $item->actual_total_laar > 0 ? ' · ' . T::mvr((int) $item->actual_total_laar / 100) : '')
            . ' · ' . T::e((string) $item->purchaseRequest?->request_no);
        if ($note !== null) {
            $lines[] = '';
            $lines[] = $note;
        }
        $buttons = [];
        if (in_array((string) $item->status, ['bought', 'partially_bought'], true) && (int) $item->bought_by !== (int) $viewer->id) {
            $buttons[] = [T::button('✅ Received', 'kc:r:' . $item->id)];
        }

        return [implode("\n", $lines), $buttons];
    }

    // ── Buttons and replies ──────────────────────────────────────────────

    /** kp:a / kp:o (prep job), kc:r (check in). */
    public function handleCallback(TelegramLink $link, User $user, string $callbackId, int $messageId, string $action, string $arg): void
    {
        [$step, $id] = array_pad(explode(':', $arg, 2), 2, '0');
        $answer = fn (string $text = '', bool $alert = false) => $this->client->answerCallback($link->bot, $callbackId, $text, $alert);

        if ($action === 'kp') {
            if (!$this->canMake($user)) {
                $answer('Your account cannot send prepared stock to the counter.', true);

                return;
            }
            $record = ProductionPlanRecord::query()->find((int) $id);
            if ($record === null) {
                $answer('That job is gone.', true);

                return;
            }
            if ($step === 'o') {
                $answer();
                $this->commands()->awaitReply($link, ['action' => 'prep_qty', 'id' => $record->id, 'message_id' => $messageId]);
                $this->commands()->send($link, 'How many did you make? Type a number.');

                return;
            }
            $remaining = max(0.0, (float) $record->planned_qty - (float) $record->made_qty);
            $why = $remaining > 0 ? $this->made($link, $user, (int) $record->id, $remaining, $messageId) : 'Already all made.';
            $answer($why ?? 'Sent to the counter.', $why !== null);

            return;
        }

        if ($action === 'kc' && $step === 'r') {
            if (!$this->can($user, 'purchase_requests.receive')) {
                $answer('Your account cannot check in deliveries.', true);

                return;
            }
            $item = PurchaseRequestItem::query()->with(['purchaseRequest', 'buyer:id,name'])->find((int) $id);
            if ($item === null) {
                $answer('That item is gone.', true);

                return;
            }
            try {
                app(PurchaseRequestVerificationService::class)->verifyItem($item, $user, [], $this->commands()->requestAs($user));
            } catch (ValidationException $e) {
                $answer((string) (collect($e->errors())->flatten()->first() ?? $e->getMessage()), true);

                return;
            }
            $answer('Checked in.');
            [$html, $buttons] = $this->checkInCard($item->fresh(['purchaseRequest', 'buyer:id,name']), $user, '✅ <b>Checked in</b> by ' . T::e($user->name) . '.');
            $this->client->editMessage($link->bot, $link->chat_id, $messageId, $html, $buttons);

            return;
        }
        $answer('This button is no longer used.');
    }

    /** @param array<string, mixed> $await */
    public function answerAwait(TelegramLink $link, User $user, array $await, string $text): bool
    {
        if (($await['action'] ?? '') !== 'prep_qty') {
            return false;
        }
        $raw = trim(str_replace(',', '.', $text));
        if (!preg_match('/^\d+(\.\d+)?$/', $raw) || (float) $raw <= 0) {
            $this->commands()->awaitReply($link, $await);
            $this->commands()->send($link, 'Just the number, e.g. <code>25</code>.');

            return true;
        }
        if (!$this->canMake($user)) {
            $this->commands()->refuse($link);

            return true;
        }
        $why = $this->made($link, $user, (int) ($await['id'] ?? 0), (float) $raw, (int) ($await['message_id'] ?? 0));
        $this->commands()->send($link, $why === null ? '✅ ' . $this->qty((float) $raw) . ' sent to the counter.' : T::e($why));

        return true;
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function canSeePrep(User $user): bool
    {
        return $this->can($user, 'kitchen.production.create') || $this->can($user, 'kitchen.production.plan');
    }

    private function canMake(User $user): bool
    {
        return $this->can($user, 'kitchen.production.create') && $this->can($user, 'kitchen.production.submit');
    }

    private function qty(float|int|string $q): string
    {
        return rtrim(rtrim(number_format((float) $q, 1, '.', ''), '0'), '.');
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
