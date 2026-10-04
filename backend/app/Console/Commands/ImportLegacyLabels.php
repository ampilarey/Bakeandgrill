<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Labels\LabelMedia;
use App\Models\Item;
use App\Models\LabelType;
use App\Models\Media;
use Illuminate\Console\Command;

/**
 * One-off: bring the owner's frozen short-eat stickers into the Label Hub.
 *
 * The stickers were made by a Python project (bake-grill-labels) with, per
 * product, hand lettering cut from the Canva posters (<key>_title.png), a
 * cut-out photo (<key>_food.png) and the ingredient lines in English and
 * Dhivehi. Point this at that project's assets/ folder, copied to the server:
 *
 *   php artisan labels:import-legacy /path/to/bake-grill-labels/assets
 *
 * Each product is matched to the menu item of the same name. Its pictures go
 * into the media library, its ingredient lines and storage onto the item, and
 * it is switched on for labels. A product that already has lettering is left
 * alone unless --force. Shelf life is not in the old project; set it in Admin.
 */
class ImportLegacyLabels extends Command
{
    protected $signature = 'labels:import-legacy {dir : The label project\'s assets folder} {--force : Replace pictures already set} {--dry-run : Report only}';

    protected $description = 'Import the frozen short-eat sticker artwork and ingredient lines into the Label Hub';

    /**
     * key => [menu item name, English ingredients, Dhivehi name, Dhivehi ingredients]
     * (from stickers_en.py and stickers_dv.py, 2026-10-04).
     *
     * @var array<string, array{0: string, 1: string, 2: string, 3: string}>
     */
    public const PRODUCTS = [
        'masroshi' => ['Masroshi', 'Onion, chilli, ginger, coconut, curry leaves, turmeric, salt, smoked tuna', 'މަސްރޮށި', 'ފިޔާ، މިރުސް، އިނގުރު، ކާށި، ހިކަނދިފަތް، ރީނދޫ، ލޮނު، ވަޅޯމަސް'],
        'havaadhulee' => ['Havaadhulee Bis', 'Flour, salt, oil, coconut, onion, ginger, chilli, lemon, curry leaves, pandan leaves, smoked tuna, spices', 'ހަވާދުލީ ބިސް', 'ފުށް، ލޮނު، ތެޔޮ، ކާށި، ފިޔާ، އިނގުރު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ރަނބާ، ވަޅޯމަސް، ހަވާދު'],
        'bajiya' => ['Bajiya', 'Flour, salt, oil, spices, onion, garlic, chilli, lemon, curry leaves, smoked tuna', 'ބާޖިޔާ', 'ފުށް، ލޮނު، ތެޔޮ، ހަވާދު، ފިޔާ، ލޮނުމެދު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް'],
        'handoo' => ['Handoo Gulha', 'Rice flour, salt, oil, coconut, onion, ginger, chilli, lemon, curry leaves, smoked tuna', 'ހަނޑޫ ގުޅަ', 'ހަނޑޫ ފުށް، ލޮނު، ތެޔޮ، ކާށި، ފިޔާ، އިނގުރު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް'],
        'fuhgulha' => ['Fuh Gulha', 'Flour, salt, oil, coconut, onion, ginger, chilli, lemon, curry leaves, smoked tuna', 'ފުށް ގުޅަ', 'ފުށް، ލޮނު، ތެޔޮ، ކާށި، ފިޔާ، އިނގުރު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް'],
        'keemiya' => ['Keemiya', 'Flour, salt, oil, coconut, onion, potato, ginger, chilli, lemon, curry leaves, smoked tuna, spices', 'ކީމިޔާ', 'ފުށް، ލޮނު، ތެޔޮ، ކާށި، ފިޔާ، އަލުވި، އިނގުރު، މިރުސް، ލުނބޯ، ހިކަނދިފަތް، ވަޅޯމަސް، ހަވާދު'],
        'patties' => ['Patties', 'Flour, salt, oil, onion, ginger, chilli, potato, black pepper, curry leaves, smoked tuna', 'ޕެޓީސް', 'ފުށް، ލޮނު، ތެޔޮ، ފިޔާ، އިނގުރު، މިރުސް، އަލުވި، ގޮލްމިރުސް، ހިކަނދިފަތް، ވަޅޯމަސް'],
        'biskeemiya' => ['Bis Keemiya', 'Flour, salt, oil, eggs, cabbage, pepper', 'ބިސްކީމިޔާ', 'ފުށް، ލޮނު، ތެޔޮ، ބިސް، ގޯބި، ގޮލްމިރުސް'],
        'boakiba' => ['Dhandi Aluvi Boakiba', 'Cassava, coconut, sugar, eggs, vanilla essence', 'ދަނޑިއަލުވި ބޯކިބާ', 'ދަނޑިއަލުވި، ކާށި، ހަކުރު، ބިސް، ވެނިލާ އެސެންސް'],
    ];

    public function handle(): int
    {
        $dir = rtrim((string) $this->argument('dir'), '/');
        if (!is_dir($dir)) {
            $this->error("No folder at {$dir}.");

            return self::FAILURE;
        }
        $dry = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $rows = [];
        $unmatched = [];

        foreach (self::PRODUCTS as $key => [$name, $ingredients, $nameDv, $ingredientsDv]) {
            $item = Item::query()->whereRaw('LOWER(TRIM(name)) = ?', [mb_strtolower($name)])->orderByDesc('is_active')->first();
            if ($item === null) {
                $unmatched[] = $name;
                $rows[] = [$name, 'no menu item of this name', '', ''];

                continue;
            }

            $changes = [
                'label_enabled' => true,
                'label_storage' => 'frozen',
                'label_ingredients_source' => $item->label_ingredients_source ?: 'auto',
                // v2: the frozen short eats are the Frozen Hedhika type.
                'label_type_id' => $item->label_type_id ?: LabelType::query()->where('storage', 'frozen')->orderBy('sort')->value('id'),
            ];
            if (trim((string) $item->label_ingredients) === '' || $force) {
                $changes['label_ingredients'] = $ingredients;
            }
            if (trim((string) $item->label_ingredients_dv) === '' || $force) {
                $changes['label_ingredients_dv'] = $ingredientsDv;
            }
            if (trim((string) $item->name_dv) === '') {
                $changes['name_dv'] = $nameDv;
            }

            $pictures = [];
            foreach (['label_title_media_id' => "{$key}_title.png", 'label_photo_media_id' => "{$key}_food.png"] as $column => $file) {
                $path = "{$dir}/{$file}";
                if (!is_file($path)) {
                    $pictures[] = "{$file} missing";

                    continue;
                }
                if ($item->{$column} && !$force) {
                    $pictures[] = "{$file} kept";

                    continue;
                }
                if (!$dry) {
                    $changes[$column] = $this->storePng($path, "{$name} label " . (str_contains($file, 'title') ? 'lettering' : 'photo'))->id;
                }
                $pictures[] = "{$file} added";
            }

            if (!$dry) {
                $item->forceFill($changes)->save();
            }
            $rows[] = [$name, "item #{$item->id}", implode(', ', $pictures), isset($changes['name_dv']) ? 'Dhivehi name set' : ''];
        }

        $this->table(['Product', 'Menu item', 'Pictures', 'Notes'], $rows);
        if ($unmatched !== []) {
            $this->warn('Not matched (rename the menu item or add it, then run again): ' . implode(', ', $unmatched));
        }
        $this->line($dry ? 'Dry run: nothing was changed.' : 'Done. Set each product\'s shelf life in Admin → Labels → Settings.');

        return self::SUCCESS;
    }

    private function storePng(string $path, string $title): Media
    {
        return LabelMedia::storePng((string) file_get_contents($path), $title);
    }
}
