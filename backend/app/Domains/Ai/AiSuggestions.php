<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use App\Domains\Labels\LabelIngredients;
use App\Domains\Labels\Nutrition;
use App\Models\AiSuggestion;
use App\Models\Category;
use App\Models\InventoryCategory;
use App\Models\InventoryItem;
use App\Models\Item;
use App\Models\LabelGlossaryEntry;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * What the assistant proposes by itself, and what happens when a person says yes (owner,
 * 2026-11-24: "since menu is public add admin approval. And can add automatic dhivehi and
 * rest of the possible automatic updates?").
 *
 * look() asks the assistant and writes each idea as an `ai_suggestions` row; it changes
 * nothing else. approve() makes the one change a row names, and only when what it found is
 * still there (a dish edited since is left alone and the row goes stale). A subject with
 * an open row, or one turned down in the last 60 days, is not proposed again. Each kind
 * has the switch of its group (AiFeatures: auto_menu, auto_inventory, auto_labels) and the
 * permission of the screen the change belongs to. A new kind is a row in KINDS, a case in
 * look() and one in apply(), never a change made straight from the assistant's answer.
 */
class AiSuggestions
{
    /** @var array<string, array{label: string, about: string, feature: string, permission: string, apply: bool}> */
    public const KINDS = [
        'menu_dhivehi' => ['label' => 'Dhivehi for dishes', 'about' => 'Dishes with no Dhivehi name or short line. Change the words before approving if they are not right.', 'feature' => 'auto_menu', 'permission' => 'menu.manage', 'apply' => true],
        'menu_category' => ['label' => 'Dishes to move', 'about' => 'Dishes that look to be in the wrong section of the menu.', 'feature' => 'auto_menu', 'permission' => 'menu.manage', 'apply' => true],
        'menu_order' => ['label' => 'Order within a section', 'about' => 'A clearer order for a section\'s dishes. Approving sets the order customers see.', 'feature' => 'auto_menu', 'permission' => 'menu.manage', 'apply' => true],
        'inventory_category' => ['label' => 'Inventory items with no category', 'about' => 'A category for each item that has none.', 'feature' => 'auto_inventory', 'permission' => 'inventory.manage', 'apply' => true],
        'inventory_duplicate' => ['label' => 'Inventory items that look alike', 'about' => 'Two items that may be one product entered twice. Nothing is merged for you: open them and decide, then dismiss.', 'feature' => 'auto_inventory', 'permission' => 'inventory.manage', 'apply' => false],
        'label_glossary' => ['label' => 'Dhivehi for label ingredients', 'about' => 'Ingredient words the glossary lacks. An approved word goes into the glossary.', 'feature' => 'auto_labels', 'permission' => 'labels.manage', 'apply' => true],
        'label_nutrition' => ['label' => 'Nutrition per 100 g', 'about' => 'Typical values for ingredients with none. Check each against its packet.', 'feature' => 'auto_labels', 'permission' => 'labels.manage', 'apply' => true],
    ];

    /** Not proposed again this long after someone turned it down. */
    private const QUIET_DAYS = 60;

    public function __construct(private readonly AiTasks $tasks, private readonly AiFeatures $features) {}

    /**
     * Ask the assistant for one kind and keep what it proposes.
     *
     * @return int how many new suggestions
     *
     * @throws AssistantUnavailable
     */
    public function look(string $kind): int
    {
        if (!isset(self::KINDS[$kind])) {
            return 0;
        }
        $this->features->mustBeOn(self::KINDS[$kind]['feature']);

        return match ($kind) {
            'menu_dhivehi' => $this->lookMenuDhivehi(),
            'menu_category' => $this->lookMenuCategory(),
            'menu_order' => $this->lookMenuOrder(),
            'inventory_category' => $this->lookInventoryCategory(),
            'inventory_duplicate' => $this->lookInventoryDuplicates(),
            'label_glossary' => $this->lookGlossary(),
            'label_nutrition' => $this->lookNutrition(),
        };
    }

    private function lookMenuDhivehi(): int
    {
        $busy = $this->busy('menu_dhivehi');
        $dishes = [];
        foreach (Item::query()->where('is_active', true)->orderBy('id')->get(['id', 'name', 'name_dv', 'short_description', 'short_description_dv']) as $i) {
            $wantName = trim((string) $i->name_dv) === '';
            $wantShort = trim((string) $i->short_description) !== '' && trim((string) $i->short_description_dv) === '';
            if (($wantName || $wantShort) && !isset($busy["item:{$i->id}"])) {
                $dishes[] = ['id' => (int) $i->id, 'name' => (string) $i->name, 'short' => (string) $i->short_description, 'want_name' => $wantName, 'want_short' => $wantShort];
            }
            if (count($dishes) >= 60) {
                break;
            }
        }
        if ($dishes === []) {
            return 0;
        }
        $names = array_column($dishes, 'name', 'id');
        $made = 0;
        foreach ($this->tasks->menuDhivehi($dishes) as $id => $dv) {
            $proposed = array_filter(['name_dv' => $dv['name_dv'], 'short_description_dv' => $dv['short_dv']], fn ($v) => $v !== '');
            if ($proposed !== []) {
                $made += $this->keep('menu_dhivehi', 'item', $id, $names[$id], null, $proposed, null);
            }
        }

        return $made;
    }

    private function lookMenuCategory(): int
    {
        $sections = $this->sections();
        if (count($sections) < 2) {
            return 0;
        }
        $busy = $this->busy('menu_category');
        $dishes = [];
        $names = [];
        foreach (Item::query()->where('is_active', true)->whereNotNull('category_id')->orderBy('id')->limit(400)->get(['id', 'name', 'category_id']) as $i) {
            if (isset($sections[(int) $i->category_id]) && !isset($busy["item:{$i->id}"])) {
                $dishes[] = ['id' => (int) $i->id, 'name' => (string) $i->name, 'in' => (int) $i->category_id];
                $names[(int) $i->id] = (string) $i->name;
            }
        }
        if ($dishes === []) {
            return 0;
        }
        $now = array_column($dishes, 'in', 'id');
        $made = 0;
        foreach ($this->tasks->misplacedDishes($dishes, $sections) as $m) {
            $made += $this->keep(
                'menu_category',
                'item',
                $m['id'],
                $names[$m['id']],
                ['category_id' => $now[$m['id']], 'category' => $sections[$now[$m['id']]]],
                ['category_id' => $m['to'], 'category' => $sections[$m['to']]],
                $m['why'],
            );
        }

        return $made;
    }

    private function lookMenuOrder(): int
    {
        $sections = $this->sections();
        $busy = $this->busy('menu_order');
        $ask = [];
        $names = [];
        $byCat = Item::query()->where('is_active', true)->whereNotNull('category_id')
            ->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'base_price', 'category_id'])->groupBy('category_id');
        foreach ($byCat as $catId => $items) {
            // Fewer than four dishes need no arranging; more than sixty is a list, not a section.
            if (!isset($sections[(int) $catId]) || isset($busy["category:{$catId}"]) || $items->count() < 4 || $items->count() > 60) {
                continue;
            }
            $ask[] = ['section' => (int) $catId, 'name' => $sections[(int) $catId], 'dishes' => $items->map(fn (Item $i) => ['id' => (int) $i->id, 'name' => (string) $i->name, 'price' => (float) $i->base_price])->values()->all()];
            foreach ($items as $i) {
                $names[(int) $i->id] = (string) $i->name;
            }
        }
        if ($ask === []) {
            return 0;
        }
        $was = [];
        foreach ($ask as $a) {
            $was[$a['section']] = array_column($a['dishes'], 'id');
        }
        $made = 0;
        foreach ($this->tasks->dishOrder($ask) as $catId => $order) {
            $made += $this->keep(
                'menu_order',
                'category',
                $catId,
                $sections[$catId],
                ['ids' => $was[$catId], 'names' => array_map(fn (int $id) => $names[$id], $was[$catId])],
                ['ids' => $order['ids'], 'names' => array_map(fn (int $id) => $names[$id], $order['ids'])],
                $order['why'],
            );
        }

        return $made;
    }

    private function lookInventoryCategory(): int
    {
        $categories = InventoryCategory::query()->where('is_active', true)->orderBy('name')->pluck('name', 'id')->map(fn ($n) => (string) $n)->all();
        if ($categories === []) {
            return 0;
        }
        $busy = $this->busy('inventory_category');
        $items = InventoryItem::query()->where('is_active', true)->whereNull('inventory_category_id')->orderBy('id')->limit(400)->pluck('name', 'id')
            ->map(fn ($n) => (string) $n)->reject(fn ($n, $id) => isset($busy["inventory_item:{$id}"]))->take(150)->all();
        if ($items === []) {
            return 0;
        }
        $made = 0;
        foreach ($this->tasks->inventoryCategories($items, $categories) as $id => $catId) {
            $made += $this->keep('inventory_category', 'inventory_item', $id, $items[$id], null, ['category_id' => $catId, 'category' => $categories[$catId]], null);
        }

        return $made;
    }

    private function lookInventoryDuplicates(): int
    {
        $items = InventoryItem::query()->where('is_active', true)->orderBy('name')->limit(500)->get(['id', 'name', 'unit'])
            ->mapWithKeys(fn (InventoryItem $i) => [(int) $i->id => trim($i->name . ' (' . $i->unit . ')')])->all();
        if (count($items) < 2) {
            return 0;
        }
        $busy = $this->busy('inventory_duplicate');
        $made = 0;
        foreach ($this->tasks->inventoryDuplicates($items) as $pair) {
            $key = "pair:{$pair['a']}-{$pair['b']}";
            if (isset($busy[$key])) {
                continue;
            }
            $made += $this->keep('inventory_duplicate', 'inventory_item', $pair['a'], $items[$pair['a']], null, ['other_id' => $pair['b'], 'other' => $items[$pair['b']]], $pair['why'], $key);
        }

        return $made;
    }

    private function lookGlossary(): int
    {
        $busy = $this->busy('label_glossary');
        $words = [];
        foreach (app(LabelIngredients::class)->missingWords() as $row) {
            $w = (string) $row['word'];
            if (!isset($busy['word:' . LabelGlossaryEntry::key($w)])) {
                $words[] = $w;
            }
        }
        $words = array_slice(array_values(array_unique($words)), 0, 60);
        if ($words === []) {
            return 0;
        }
        $made = 0;
        foreach ($this->tasks->glossary($words) as $en => $found) {
            $made += $this->keep('label_glossary', 'word', null, $en, null, ['dv' => $found['dv']], $found['sure'] ? null : 'A guess: please check', 'word:' . LabelGlossaryEntry::key($en));
        }

        return $made;
    }

    private function lookNutrition(): int
    {
        $ingredients = app(LabelIngredients::class);
        $ids = [];
        foreach (Item::query()->where('label_enabled', true)->where('is_active', true)->get() as $item) {
            foreach ($ingredients->recipeIngredients($item) as $row) {
                $ids[(int) $row['inventory_id']] = true;
            }
        }
        $busy = $this->busy('label_nutrition');
        $names = InventoryItem::query()->whereIn('id', array_keys($ids))->whereNull('nutrition')->orderBy('name')->pluck('name', 'id')
            ->map(fn ($n) => (string) $n)->reject(fn ($n, $id) => isset($busy["inventory_item:{$id}"]))->take(40)->all();
        if ($names === []) {
            return 0;
        }
        $made = 0;
        foreach ($this->tasks->nutrition($names) as $id => $values) {
            $made += $this->keep('label_nutrition', 'inventory_item', $id, $names[$id], null, $values, null);
        }

        return $made;
    }

    /**
     * Make the change a suggestion names. A suggestion whose subject has changed since goes stale.
     *
     * @param array<string, mixed> $edits the person's own wording, for the kinds that take it
     * @return string approved | stale | rejected
     */
    public function approve(AiSuggestion $s, User $by, array $edits = []): string
    {
        if ($s->status !== 'pending') {
            return (string) $s->status;
        }
        if (!(self::KINDS[$s->kind]['apply'] ?? false)) {
            return $this->close($s, 'rejected', $by);
        }

        return DB::transaction(function () use ($s, $by, $edits): string {
            $done = $this->apply($s, $edits);

            return $this->close($s, $done ? 'approved' : 'stale', $by);
        });
    }

    public function reject(AiSuggestion $s, User $by): string
    {
        return $s->status === 'pending' ? $this->close($s, 'rejected', $by) : (string) $s->status;
    }

    /** @param array<string, mixed> $edits */
    private function apply(AiSuggestion $s, array $edits): bool
    {
        $p = (array) $s->proposed;
        $before = (array) ($s->before ?? []);
        switch ($s->kind) {
            case 'menu_dhivehi':
                $item = Item::query()->find($s->subject_id);
                if (!$item) {
                    return false;
                }
                $set = [];
                foreach (['name_dv' => 120, 'short_description_dv' => 140] as $field => $max) {
                    $text = mb_substr(trim((string) ($edits[$field] ?? $p[$field] ?? '')), 0, $max);
                    // Only into a box that is still empty: Dhivehi typed since is the person's own.
                    if ($text !== '' && isset($p[$field]) && trim((string) $item->{$field}) === '') {
                        $set[$field] = $text;
                    }
                }
                if ($set === []) {
                    return false;
                }
                $item->update($set);
                $s->proposed = $set;

                return true;
            case 'menu_category':
                $item = Item::query()->find($s->subject_id);
                if (!$item || (int) $item->category_id !== (int) ($before['category_id'] ?? 0) || !Category::query()->whereKey($p['category_id'] ?? 0)->exists()) {
                    return false;
                }
                $item->update(['category_id' => (int) $p['category_id']]);

                return true;
            case 'menu_order':
                $ids = array_map('intval', (array) ($p['ids'] ?? []));
                $inSection = Item::query()->where('category_id', $s->subject_id)->whereIn('id', $ids)->pluck('id')->map(fn ($i) => (int) $i)->all();
                if (count($inSection) < 2) {
                    return false;
                }
                // The dishes still in the section, in the proposed order, ahead of any added since.
                $pos = 0;
                foreach ($ids as $id) {
                    if (in_array($id, $inSection, true)) {
                        Item::query()->whereKey($id)->update(['sort_order' => $pos += 10]);
                    }
                }
                foreach (Item::query()->where('category_id', $s->subject_id)->whereNotIn('id', $ids)->orderBy('sort_order')->orderBy('name')->pluck('id') as $id) {
                    Item::query()->whereKey($id)->update(['sort_order' => $pos += 10]);
                }

                return true;
            case 'inventory_category':
                $inv = InventoryItem::query()->find($s->subject_id);
                if (!$inv || $inv->inventory_category_id !== null || !InventoryCategory::query()->whereKey($p['category_id'] ?? 0)->exists()) {
                    return false;
                }
                $inv->update(['inventory_category_id' => (int) $p['category_id']]);

                return true;
            case 'label_glossary':
                $dv = mb_substr(trim((string) ($edits['dv'] ?? $p['dv'] ?? '')), 0, 160);
                if ($dv === '' || LabelGlossaryEntry::lookup((string) $s->subject_label) !== null) {
                    return false;
                }
                LabelGlossaryEntry::query()->create(['en' => (string) $s->subject_label, 'dv' => $dv]);
                $s->proposed = ['dv' => $dv];

                return true;
            case 'label_nutrition':
                $inv = InventoryItem::query()->find($s->subject_id);
                $clean = Nutrition::clean($p);
                if (!$inv || $inv->nutrition !== null || $clean === null) {
                    return false;
                }
                $inv->forceFill(['nutrition' => $clean])->save();

                return true;
        }

        return false;
    }

    private function close(AiSuggestion $s, string $status, User $by): string
    {
        $s->status = $status;
        $s->decided_by = $by->id;
        $s->decided_at = now();
        $s->save();

        return $status;
    }

    /** @return array<int, string> every active menu section by id, as "Mains › Momo" */
    private function sections(): array
    {
        $all = Category::query()->where('is_active', true)->get(['id', 'parent_id', 'name'])->keyBy('id');
        $out = [];
        foreach ($all as $c) {
            $parent = $c->parent_id ? $all->get($c->parent_id) : null;
            $out[(int) $c->id] = ($parent ? $parent->name . ' › ' : '') . $c->name;
        }

        return $out;
    }

    /**
     * Subjects not to propose for: one is waiting already, or was turned down lately.
     *
     * @return array<string, true> by subject key
     */
    private function busy(string $kind): array
    {
        return AiSuggestion::query()->where('kind', $kind)
            ->where(fn ($q) => $q->where('status', 'pending')->orWhere(fn ($r) => $r->where('status', 'rejected')->where('decided_at', '>=', now()->subDays(self::QUIET_DAYS))))
            ->pluck('subject_key')->flip()->map(fn () => true)->all();
    }

    /** @param array<string, mixed>|null $before @param array<string, mixed> $proposed */
    private function keep(string $kind, string $type, ?int $id, string $label, ?array $before, array $proposed, ?string $reason, ?string $key = null): int
    {
        AiSuggestion::query()->create([
            'kind' => $kind, 'subject_type' => $type, 'subject_id' => $id, 'subject_label' => mb_substr($label, 0, 255),
            'before' => $before, 'proposed' => $proposed, 'reason' => $reason !== null && $reason !== '' ? mb_substr($reason, 0, 255) : null,
            'status' => 'pending', 'subject_key' => $key ?? "{$type}:{$id}",
        ]);

        return 1;
    }

    /** How many wait for someone with this permission (Needs attention). */
    public static function waiting(?string $permission = null): int
    {
        $kinds = array_keys(array_filter(self::KINDS, fn (array $k) => $permission === null || $k['permission'] === $permission));

        return AiSuggestion::query()->where('status', 'pending')->whereIn('kind', $kinds)->count();
    }
}
