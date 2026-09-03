<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Item;
use App\Models\PosQuickLayout;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The Quick tabs on the till: a shared layout every till starts with, and a
 * personal layout per cashier shown in front of it.
 *
 * A layout is a list of tabs — name, items in order, optional hours. It
 * travels inside the menu payload, which the till caches, so the tabs are
 * there offline and on whichever iPad the cashier logs into. Saving replaces
 * the whole layout: the till holds it and sends it back after every change,
 * which is simpler than a diff and cannot drift.
 *
 * @phpstan-type Tab array{id: string, name: string, items: list<int>, from: string|null, to: string|null}
 */
class PosQuickKeyService
{
    public const MAX_TABS = 6;
    public const MAX_KEYS = 24;
    public const MAX_NAME = 24;

    /**
     * @return array{shared: list<Tab>, mine: list<Tab>}
     */
    public function forUser(?int $userId): array
    {
        $rows = PosQuickLayout::query()
            ->when(
                $userId === null,
                fn ($q) => $q->whereNull('user_id'),
                fn ($q) => $q->where(fn ($w) => $w->whereNull('user_id')->orWhere('user_id', $userId)),
            )
            ->get(['user_id', 'tabs']);

        $shared = $rows->firstWhere('user_id', null);
        $mine = $userId === null ? null : $rows->firstWhere('user_id', $userId);

        return [
            'shared' => $shared ? self::clean($shared->tabs) : [],
            'mine' => $mine ? self::clean($mine->tabs) : [],
        ];
    }

    /**
     * Replace a layout. Unknown, deleted and duplicate items are dropped rather
     * than rejected — a till saving a layout it built from a cached menu must
     * not fail because one item was retired in the meantime. Names, counts and
     * hours are validated, since those are typed by a person.
     *
     * @param list<array<string, mixed>> $tabs
     * @return list<Tab> what was stored
     */
    public function replace(?int $userId, array $tabs): array
    {
        $tabs = self::validate($tabs);

        $itemIds = [];
        foreach ($tabs as $tab) {
            $itemIds = array_merge($itemIds, $tab['items']);
        }
        $known = array_flip(Item::query()->whereIn('id', array_unique($itemIds))->pluck('id')->map('intval')->all());
        foreach ($tabs as &$tab) {
            $tab['items'] = array_values(array_filter($tab['items'], fn (int $id) => isset($known[$id])));
        }
        unset($tab);

        self::store($userId, $tabs);

        return $tabs;
    }

    /**
     * One row per owner, held under a lock while it is written. The unique
     * index does that for a cashier's row, but MySQL lets any number of
     * NULLs through a unique column, so two menu managers saving the shared
     * layout at once could otherwise leave two shared rows behind.
     *
     * @param list<Tab> $tabs
     */
    private static function store(?int $userId, array $tabs): void
    {
        DB::transaction(function () use ($userId, $tabs) {
            $row = PosQuickLayout::query()
                ->when($userId === null, fn ($q) => $q->whereNull('user_id'), fn ($q) => $q->where('user_id', $userId))
                ->lockForUpdate()
                ->first();
            if ($row) {
                $row->update(['tabs' => $tabs]);
            } else {
                PosQuickLayout::query()->create(['user_id' => $userId, 'tabs' => $tabs]);
            }
        });
    }

    /**
     * Other cashiers whose layout can be copied: anyone with at least one tab.
     * Names only — a layout is a list of menu items, nothing private.
     *
     * @return list<array{user_id: int, name: string, tabs: int}>
     */
    public function sources(int $forUserId): array
    {
        return PosQuickLayout::query()
            ->with('user:id,name')
            ->whereNotNull('user_id')
            ->where('user_id', '!=', $forUserId)
            ->get()
            ->filter(fn (PosQuickLayout $row) => $row->user !== null && count(self::clean($row->tabs)) > 0)
            ->map(fn (PosQuickLayout $row) => [
                'user_id' => (int) $row->user_id,
                'name' => (string) $row->user->name,
                'tabs' => count(self::clean($row->tabs)),
            ])
            ->sortBy('name')
            ->values()
            ->all();
    }

    /**
     * Give a cashier a copy of somebody else's tabs. A copy, not a link: the
     * original owner can go on editing theirs without touching the copy.
     *
     * @return list<Tab>
     */
    public function copy(int $fromUserId, int $toUserId): array
    {
        $source = PosQuickLayout::query()->where('user_id', $fromUserId)->first();
        $tabs = $source ? self::clean($source->tabs) : [];
        if ($tabs === [] || !User::query()->whereKey($fromUserId)->exists()) {
            throw ValidationException::withMessages(['user_id' => ['That cashier has no Quick tabs to copy.']]);
        }

        // Fresh ids so two copies of the same layout never share a tab id.
        foreach ($tabs as $i => &$tab) {
            $tab['id'] = 'tab-' . ($i + 1) . '-' . substr(md5((string) mt_rand()), 0, 6);
        }
        unset($tab);

        self::store($toUserId, $tabs);

        return $tabs;
    }

    /**
     * @param list<array<string, mixed>> $tabs
     * @return list<Tab>
     */
    private static function validate(array $tabs): array
    {
        if (count($tabs) > self::MAX_TABS) {
            throw ValidationException::withMessages(['tabs' => ['A layout holds up to ' . self::MAX_TABS . ' tabs.']]);
        }

        $out = [];
        $seenIds = [];
        foreach (array_values($tabs) as $index => $tab) {
            if (!is_array($tab)) {
                throw ValidationException::withMessages(["tabs.$index" => ['Each tab must be an object.']]);
            }
            $name = trim((string) ($tab['name'] ?? ''));
            if ($name === '' || mb_strlen($name) > self::MAX_NAME) {
                throw ValidationException::withMessages(["tabs.$index.name" => ['A tab needs a name of up to ' . self::MAX_NAME . ' characters.']]);
            }
            $items = $tab['items'] ?? [];
            if (!is_array($items)) {
                throw ValidationException::withMessages(["tabs.$index.items" => ['Items must be a list.']]);
            }
            $items = array_values(array_unique(array_filter(array_map('intval', $items), fn (int $id) => $id > 0)));
            if (count($items) > self::MAX_KEYS) {
                throw ValidationException::withMessages(["tabs.$index.items" => ['A tab holds up to ' . self::MAX_KEYS . ' items.']]);
            }
            $from = self::hour($tab['from'] ?? null, "tabs.$index.from");
            $to = self::hour($tab['to'] ?? null, "tabs.$index.to");
            if (($from === null) !== ($to === null)) {
                throw ValidationException::withMessages(["tabs.$index.from" => ['Set both a start and an end time, or neither.']]);
            }
            $id = trim((string) ($tab['id'] ?? ''));
            if ($id === '' || isset($seenIds[$id]) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $id)) {
                $id = 'tab-' . ($index + 1);
                while (isset($seenIds[$id])) {
                    $id .= '-';
                }
            }
            $seenIds[$id] = true;

            $out[] = ['id' => $id, 'name' => $name, 'items' => $items, 'from' => $from, 'to' => $to];
        }

        return $out;
    }

    private static function hour(mixed $value, string $field): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value)) {
            throw ValidationException::withMessages([$field => ['Times are HH:MM, 24-hour.']]);
        }

        return $value;
    }

    /**
     * A stored layout, normalised — a row written by an older build or by
     * hand must still come out in the one shape the till expects.
     *
     * @return list<Tab>
     */
    private static function clean(mixed $tabs): array
    {
        if (!is_array($tabs)) {
            return [];
        }
        try {
            return self::validate(array_values($tabs));
        } catch (ValidationException) {
            return [];
        }
    }
}
