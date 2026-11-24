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
use App\Models\Media;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

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
    /** @var array<string, array{label: string, about: string, feature: string, permission: string, apply: bool, look?: string}> */
    public const KINDS = [
        'menu_dhivehi' => ['label' => 'Dhivehi for dishes', 'about' => 'Dishes with no Dhivehi name or short line. Change the words before approving if they are not right.', 'feature' => 'auto_menu', 'permission' => 'menu.manage', 'apply' => true],
        'menu_category' => ['label' => 'Dishes to move', 'about' => 'Dishes that look to be in the wrong section of the menu.', 'feature' => 'auto_menu', 'permission' => 'menu.manage', 'apply' => true],
        'menu_order' => ['label' => 'Order within a section', 'about' => 'A clearer order for a section\'s dishes. Approving sets the order customers see.', 'feature' => 'auto_menu', 'permission' => 'menu.manage', 'apply' => true],
        'inventory_category' => ['label' => 'Inventory items with no category', 'about' => 'A category for each item that has none.', 'feature' => 'auto_inventory', 'permission' => 'inventory.manage', 'apply' => true],
        'inventory_duplicate' => ['label' => 'Inventory items that look alike', 'about' => 'Two items that may be one product entered twice. Nothing is merged for you: open them and decide, then dismiss.', 'feature' => 'auto_inventory', 'permission' => 'inventory.manage', 'apply' => false],
        'label_glossary' => ['label' => 'Dhivehi for label ingredients', 'about' => 'Ingredient words the glossary lacks. An approved word goes into the glossary.', 'feature' => 'auto_labels', 'permission' => 'labels.manage', 'apply' => true],
        'label_nutrition' => ['label' => 'Nutrition per 100 g', 'about' => 'Typical values for ingredients with none. Check each against its packet.', 'feature' => 'auto_labels', 'permission' => 'labels.manage', 'apply' => true],
        // Photos (owner, 2026-11-24: "I need generate food photo too. And build all the features"). One look at a dish's
        // photo makes all three of the first kinds, so Look now on any of them is the same look (`look`).
        'photo_crop' => ['label' => 'A better crop for a dish photo', 'about' => 'The dish whole and in the middle, cut again from the photo you uploaded. Approving replaces the picture customers see.', 'feature' => 'auto_photos', 'permission' => 'menu.manage', 'apply' => true],
        'photo_check' => ['label' => 'Photos worth retaking', 'about' => 'Dish photos that look blurry, dark, cut off, or not like the dish. Nothing is changed: retake or replace the photo, then dismiss.', 'feature' => 'auto_photos', 'permission' => 'menu.manage', 'apply' => false, 'look' => 'photo_crop'],
        'photo_cutout' => ['label' => 'Photos that would cut out cleanly', 'about' => 'Dishes photographed on a plain background that have no cut-out yet. Make the cut-out on the dish\'s Photos tab, then dismiss.', 'feature' => 'auto_photos', 'permission' => 'menu.manage', 'apply' => false, 'look' => 'photo_crop'],
        'media_describe' => ['label' => 'Descriptions for library pictures', 'about' => 'What each picture shows, and words to find it by. You can change the description before approving.', 'feature' => 'auto_photos', 'permission' => 'media.manage', 'apply' => true],
        'photo_generate' => ['label' => 'Made photos for dishes with none', 'about' => 'A picture made by the image service for your best-selling dishes without a photo. It is not a photo of your own food: approve it only if it looks like what you serve.', 'feature' => 'photo_generate', 'permission' => 'menu.manage', 'apply' => true],
    ];

    /** Not proposed again this long after someone turned it down. */
    private const QUIET_DAYS = 60;

    /** Photos looked at in one go: each is a call to the assistant with a picture. */
    public const PHOTOS_A_LOOK = 20;

    /** Pictures made in one go: each costs far more than a look. */
    public const MADE_A_LOOK = 3;

    private const ISSUE_WORDS = ['blurry' => 'out of focus', 'dark' => 'too dark', 'cut_off' => 'part of the dish is cut off', 'text_or_logo' => 'writing or a logo on it', 'wrong_dish' => 'does not look like this dish', 'cluttered' => 'other things crowd the dish'];

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
            'photo_crop', 'photo_check', 'photo_cutout' => $this->lookPhotos(),
            'media_describe' => $this->lookLibrary(),
            'photo_generate' => $this->lookMakePhotos(),
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

    /** One look at each dish photo not seen yet: a better crop, what is wrong with it, whether it would cut out. */
    private function lookPhotos(): int
    {
        $photos = app(PhotoWork::class);
        $busy = ['photo_crop' => $this->busy('photo_crop'), 'photo_check' => $this->busy('photo_check'), 'photo_cutout' => $this->busy('photo_cutout')];
        $made = 0;
        $looked = 0;
        foreach (Item::query()->where('is_active', true)->whereNotNull('image_url')->where('image_url', '!=', '')->orderBy('id')->get() as $item) {
            $seen = sha1((string) $item->image_url);
            if ($item->ai_photo_seen === $seen) {
                continue;
            }
            if ($looked >= self::PHOTOS_A_LOOK) {
                break;
            }
            // The photo as it was uploaded when it was kept, else the menu's own cut of it.
            $master = $photos->bytes($item->image_original_url);
            $source = $master ?? $photos->bytes($item->image_url);
            $small = $source !== null ? $photos->forLooking($source) : null;
            if ($small === null) {
                $item->forceFill(['ai_photo_seen' => $seen])->saveQuietly();

                continue;
            }
            $looked++;
            $saw = $this->tasks->dishPhoto(['bytes' => $small['bytes'], 'mime' => $small['mime']], (string) $item->name, trim(strip_tags((string) ($item->short_description ?: $item->description))));
            $key = "item:{$item->id}";

            if ($master !== null && !isset($busy['photo_crop'][$key])) {
                $crop = PhotoWork::cropFor($small['w'], $small['h'], $saw['box']);
                // Worth proposing only when it is plainly another cut than the one from the middle.
                if (PhotoWork::apart($crop, PhotoWork::middleCrop($small['w'], $small['h'])) > 0.2 && ($cut = $photos->cut($master, $crop)) !== null) {
                    $made += $this->keep('photo_crop', 'item', (int) $item->id, (string) $item->name, ['image' => $item->image_url], ['preview' => $photos->keepPreview($cut), 'crop' => $crop], null);
                }
            }
            if ($saw['issues'] !== [] && !isset($busy['photo_check'][$key])) {
                $words = implode(', ', array_map(fn (string $i) => self::ISSUE_WORDS[$i] ?? $i, $saw['issues']));
                $made += $this->keep('photo_check', 'item', (int) $item->id, (string) $item->name, null, ['image' => $item->image_url, 'issues' => $saw['issues']], ucfirst($words) . ($saw['note'] !== '' ? '. ' . $saw['note'] : ''));
            }
            if ($saw['plain'] && trim((string) $item->cutout_url) === '' && !isset($busy['photo_cutout'][$key])) {
                $made += $this->keep('photo_cutout', 'item', (int) $item->id, (string) $item->name, null, ['image' => $item->image_url], null);
            }
            $item->forceFill(['ai_photo_seen' => $seen])->saveQuietly();
        }

        return $made;
    }

    /** A description and tags for library pictures that have neither. */
    private function lookLibrary(): int
    {
        $photos = app(PhotoWork::class);
        $made = 0;
        $rows = Media::query()->where('media_type', 'image')->whereNull('ai_described_at')
            ->where(fn ($q) => $q->whereNull('alt_text')->orWhere('alt_text', ''))->orderByDesc('id')->limit(self::PHOTOS_A_LOOK)->get();
        foreach ($rows as $m) {
            $bytes = null;
            try {
                $bytes = Storage::disk((string) ($m->disk ?: 'public'))->get((string) $m->path);
            } catch (\Throwable) {
                // A row whose file has gone: marked, so it is not asked about again.
            }
            $small = is_string($bytes) && $bytes !== '' ? $photos->forLooking($bytes, 1200) : null;
            if ($small !== null) {
                $said = $this->tasks->describePicture(['bytes' => $small['bytes'], 'mime' => $small['mime']], (string) $m->title);
                if ($said['alt'] !== '') {
                    $made += $this->keep('media_describe', 'media', (int) $m->id, (string) ($m->title ?: basename((string) $m->path)), null, ['alt_text' => $said['alt'], 'tags' => $said['tags'], 'image' => $m->thumb_url ?: $m->url], null);
                }
            }
            $m->forceFill(['ai_described_at' => now()])->saveQuietly();
        }

        return $made;
    }

    /** A made picture for the best-selling dishes that have no photo. */
    private function lookMakePhotos(): int
    {
        $maker = app(ImageMaker::class);
        if (!$maker->ready()) {
            throw new AssistantUnavailable('Making pictures needs a Google key: add one under System → Integrations → API keys.');
        }
        $busy = $this->busy('photo_generate');
        $items = Item::query()->where('is_active', true)->where(fn ($q) => $q->whereNull('image_url')->orWhere('image_url', ''))
            ->withCount(['orderItems as sold_lately' => fn ($q) => $q->where('created_at', '>=', now()->subDays(30))])
            ->orderByDesc('sold_lately')->orderBy('name')->limit(60)->get()
            ->reject(fn (Item $i) => isset($busy["item:{$i->id}"]))->take(self::MADE_A_LOOK);
        $photos = app(PhotoWork::class);
        $made = 0;
        foreach ($items as $item) {
            $about = trim(strip_tags((string) ($item->short_description ?: $item->description)));
            $bytes = $maker->make(AiTasks::photoPrompt((string) $item->name, $about));
            $made += $this->keep('photo_generate', 'item', (int) $item->id, (string) $item->name, null, ['preview' => $photos->keepPreview($bytes)], null);
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
            case 'photo_crop':
                $item = Item::query()->find($s->subject_id);
                $bytes = app(PhotoWork::class)->bytes($p['preview'] ?? null);
                // The photo it was cut from is still the dish's photo.
                if (!$item || $bytes === null || (string) $item->image_url !== (string) ($before['image'] ?? '')) {
                    return false;
                }
                app(PhotoWork::class)->install($item, $bytes, newMaster: false, generated: (bool) $item->image_ai_generated);
                $item->forceFill(['ai_photo_seen' => sha1((string) $item->image_url)])->saveQuietly();

                return true;
            case 'photo_generate':
                $item = Item::query()->find($s->subject_id);
                $bytes = app(PhotoWork::class)->bytes($p['preview'] ?? null);
                // Only for a dish that still has no photo: one uploaded since is the real thing.
                if (!$item || $bytes === null || trim((string) $item->image_url) !== '') {
                    return false;
                }
                app(PhotoWork::class)->install($item, $bytes, newMaster: true, generated: true);
                $item->forceFill(['ai_photo_seen' => sha1((string) $item->image_url)])->saveQuietly();

                return true;
            case 'media_describe':
                $m = Media::query()->find($s->subject_id);
                $alt = mb_substr(trim((string) ($edits['alt_text'] ?? $p['alt_text'] ?? '')), 0, 160);
                if (!$m || $alt === '' || trim((string) $m->alt_text) !== '') {
                    return false;
                }
                $tags = is_array($m->tags) && $m->tags !== [] ? $m->tags : array_values(array_map('strval', (array) ($p['tags'] ?? [])));
                $m->forceFill(['alt_text' => $alt, 'tags' => $tags])->save();
                $s->proposed = ['alt_text' => $alt, 'tags' => $tags] + $p;

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
        // A picture kept only to be looked at has done its job, whatever was decided.
        if (isset(((array) $s->proposed)['preview'])) {
            app(PhotoWork::class)->dropPreview((string) ((array) $s->proposed)['preview']);
        }
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
