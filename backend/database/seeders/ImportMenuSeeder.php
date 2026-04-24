<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Database\Seeder;

class ImportMenuSeeder extends Seeder
{
    /** Relevant photos from Unsplash (free to use). w=200&h=150 for faster load */
    private const WEB_IMAGES = [
        'coffee' => 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200&h=150&fit=crop',
        'tea' => 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=200&h=150&fit=crop',
        'espresso' => 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=200&h=150&fit=crop',
        'cappuccino' => 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&h=150&fit=crop',
        'latte' => 'https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=200&h=150&fit=crop',
        'burger' => 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&h=150&fit=crop',
        'pizza' => 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=200&h=150&fit=crop',
        'sandwich' => 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=200&h=150&fit=crop',
        'submarine' => 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=200&h=150&fit=crop',
        'chicken' => 'https://images.unsplash.com/photo-1594221708779-94832f4320d1?w=200&h=150&fit=crop',
        'hotdog' => 'https://images.unsplash.com/photo-1612392062422-ef19b42f74df?w=200&h=150&fit=crop',
        'sausage' => 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=200&h=150&fit=crop',
        'sausage_roll' => 'https://images.unsplash.com/photo-1541599468341-241a5a2e1b1b?w=200&h=150&fit=crop',
        'cake' => 'https://images.unsplash.com/photo-1571115171-1e06d4b8b2c?w=200&h=150&fit=crop',
        'pastry' => 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=200&h=150&fit=crop',
        'bun' => 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=150&fit=crop',
        'crepe' => 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=200&h=150&fit=crop',
        'water' => 'https://images.unsplash.com/photo-1562907550-096d085bf946?w=200&h=150&fit=crop',
        'soda' => 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=200&h=150&fit=crop',
        'lemon_lime' => 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=200&h=150&fit=crop',
        'orange_soda' => 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=200&h=150&fit=crop',
        'juice' => 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=200&h=150&fit=crop',
        'fritter' => 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=200&h=150&fit=crop',
        'snack' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=200&h=150&fit=crop',
        'chips' => 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=200&h=150&fit=crop',
        'bread' => 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&h=150&fit=crop',
        'cutlet' => 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=200&h=150&fit=crop',
        'roll' => 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=200&h=150&fit=crop',
        'food' => 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&h=150&fit=crop',
        'betel' => 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=200&h=150&fit=crop',
    ];

    /** Item handle or name (lowercase) => key in WEB_IMAGES for exact match */
    private const ITEM_IMAGE_MAP = [
        'bajiya' => 'fritter', 'bileh-ari' => 'betel', 'bileh ari' => 'betel', 'bileh gandu' => 'betel', 'dhufa' => 'betel', 'bis-keemia' => 'snack',
        'black-coffee' => 'coffee', 'black coffee' => 'coffee', 'black-tea' => 'tea', 'black tea' => 'tea',
        'bombe-tea' => 'tea', 'bombe tea' => 'tea', 'burger-(big)' => 'burger', 'burger small' => 'burger',
        'cake-folding' => 'pastry', 'cake folhi' => 'pastry', 'cardamom-tea' => 'tea', 'cardamom tea' => 'tea',
        'chicken-leg' => 'chicken', 'chicken leg' => 'chicken', 'chicken-n-chips' => 'chips',
        'chicken n chips' => 'chips', 'chicken-sandwich' => 'sandwich', 'chicken sandwich' => 'sandwich',
        'chicken-submarine' => 'submarine', 'chicken submarine' => 'submarine',
        'club-sandwich-full' => 'sandwich', 'club sandwich full' => 'sandwich',
        'club-sandwich-s' => 'sandwich', 'club sandwich s' => 'sandwich',
        'coke-small' => 'soda', 'coke small' => 'soda', 'cream-bun' => 'bun', 'cream bun' => 'bun',
        'crepe/foni-folhi' => 'crepe', 'crepe/foni folhi' => 'crepe', 'cutlet' => 'cutlet',
        'egg-cutlets' => 'snack', 'egg cutlets' => 'snack', 'egg-patty' => 'snack', 'egg patty' => 'snack',
        'f.gulha' => 'fritter', 'f.gulha' => 'fritter', 'h.gulha' => 'fritter', 'h.gulha' => 'fritter',
        'fanta-orange-small' => 'orange_soda', 'fanta orange small' => 'orange_soda', 'g-boakibaa' => 'pastry', 'g.boakibaa' => 'pastry',
        'g.cake' => 'cake', 'hot-dog' => 'hotdog', 'hot dog' => 'hotdog',
        'illy-black' => 'espresso', 'illy black' => 'espresso', 'illy-milk' => 'latte', 'illy milk' => 'latte',
        'kanamdhu-cake' => 'cake', 'kanamdhu cake' => 'cake', 'kavaabu' => 'fritter',
        'kulhi-boakibaa' => 'pastry', 'kulhi boakibaa' => 'pastry',
        'lavaza-black' => 'espresso', 'lavaza black' => 'espresso',
        'cappuccino' => 'cappuccino', 'lavaza cappuccino' => 'cappuccino',
        'lavaza-espresso-single' => 'espresso', 'lavaza-expresso-double' => 'espresso', 'lavaza expresso double' => 'espresso',
        'lavaza-latte' => 'latte', 'lavaza latte' => 'latte', 'lavaza-milk' => 'latte', 'lavaza milk' => 'latte',
        'lemon-tea' => 'tea', 'lemon tea' => 'tea', 'mas-roshi' => 'bread', 'mas roshi' => 'bread',
        'masala-tea' => 'tea', 'masala tea' => 'tea', 'milk-coffee' => 'coffee', 'milk coffee' => 'coffee',
        'milk-tea' => 'tea', 'milk tea' => 'tea', 'paan-boakibaa' => 'pastry', 'paan boakibaa' => 'pastry',
        'pizza-slice' => 'pizza', 'pizza slice' => 'pizza', 'roast-paan' => 'pastry', 'roast paan' => 'pastry',
        'sausage' => 'sausage', 'sausage-roll' => 'sausage_roll', 'sausage roll' => 'sausage_roll',
        'schweppes-small' => 'soda', 'schweppes small' => 'soda',
        'sprite-small' => 'lemon_lime', 'sprite small' => 'lemon_lime',
        'chicken-rolls' => 'roll', 'tuna rolls' => 'roll', 'tuna-sandwich' => 'sandwich', 'tuna sandwich' => 'sandwich',
        'water-b' => 'water', 'water b' => 'water', 'water-s' => 'water', 'water s' => 'water',
        'xl-small' => 'juice', 'xl small' => 'juice',
    ];

    /** Local item photos (in public/images/cafe/) – used when file exists, overrides web images */
    private const LOCAL_ITEM_IMAGES = [
        'bajiya' => '/images/cafe/Bajiya.png',
        'bis-keemia' => '/images/cafe/Bis-keemia.png',
        'bis keemia' => '/images/cafe/Bis-keemia.png',
        'cake-folding' => '/images/cafe/Cake-folhi.png',
        'cake folhi' => '/images/cafe/Cake-folhi.png',
        'bileh-ari' => '/images/cafe/Betel-leaf.png',
        'bileh ari' => '/images/cafe/Betel-leaf.png',
        'dhufa' => '/images/cafe/Betel-leaf.png',
        'bileh gandu' => '/images/cafe/Betel-leaf.png',
        'cream-bun' => '/images/cafe/Cream-bun.png',
        'cream bun' => '/images/cafe/Cream-bun.png',
        'cutlet' => '/images/cafe/Cutlet.png',
        'egg-cutlets' => '/images/cafe/Egg-cutlets.png',
        'egg cutlets' => '/images/cafe/Egg-cutlets.png',
        'egg-patty' => '/images/cafe/Egg-patty.png',
        'egg patty' => '/images/cafe/Egg-patty.png',
        'f.gulha' => '/images/cafe/F-gulha.png',
        'h.gulha' => '/images/cafe/H-gulha.png',
        'g-boakibaa' => '/images/cafe/G-boakibaa.png',
        'g boakibaa' => '/images/cafe/G-boakibaa.png',
        'g.boakibaa' => '/images/cafe/G-boakibaa.png',
        'g.cake' => '/images/cafe/G-cake.png',
        'kanamdhu-cake' => '/images/cafe/Kanamdhu-cake.png',
        'kanamdhu cake' => '/images/cafe/Kanamdhu-cake.png',
        'kulhi-boakibaa' => '/images/cafe/Kulhi-boakibaa.png',
        'kulhi boakibaa' => '/images/cafe/Kulhi-boakibaa.png',
        'kavaabu' => '/images/cafe/Kavaabu.png',
        'mas-roshi' => '/images/cafe/Mas-roshi.png',
        'mas roshi' => '/images/cafe/Mas-roshi.png',
        'paan-boakibaa' => '/images/cafe/Paan-boakibaa.png',
        'paan boakibaa' => '/images/cafe/Paan-boakibaa.png',
        'roast-paan' => '/images/cafe/Roast-paan.png',
        'roast paan' => '/images/cafe/Roast-paan.png',
        'sausage' => '/images/cafe/Sausage.png',
        'sausage-roll' => '/images/cafe/Sausage-roll.png',
        'sausage roll' => '/images/cafe/Sausage-roll.png',
        'sprite-small' => '/images/cafe/Sprite-small.png',
        'sprite small' => '/images/cafe/Sprite-small.png',
        'tuna-rolls' => '/images/cafe/Tuna-rolls.png',
        'tuna rolls' => '/images/cafe/Tuna-rolls.png',
        'fanta-orange-small' => '/images/cafe/Fanta-orange-small.png',
        'fanta orange small' => '/images/cafe/Fanta-orange-small.png',
        'schweppes-small' => '/images/cafe/Schweppes.png',
        'schweppes small' => '/images/cafe/Schweppes.png',
        'xl-small' => '/images/cafe/XL-small.png',
        'xl small' => '/images/cafe/XL-small.png',
        'water-b' => '/images/cafe/Water.png',
        'water b' => '/images/cafe/Water.png',
        'water-s' => '/images/cafe/Water.png',
        'water s' => '/images/cafe/Water.png',
    ];

    /** Return local image map for use by SyncItemImagesCommand */
    public static function getLocalImageMap(): array
    {
        return self::LOCAL_ITEM_IMAGES;
    }

    private static function getRelevantImageUrl(string $name, string $handle, string $imageKey): string
    {
        $handleKey = strtolower(trim($handle));
        $nameKey = strtolower(trim($name));
        if (isset(self::LOCAL_ITEM_IMAGES[$handleKey])) {
            return self::LOCAL_ITEM_IMAGES[$handleKey];
        }
        if (isset(self::LOCAL_ITEM_IMAGES[$nameKey])) {
            return self::LOCAL_ITEM_IMAGES[$nameKey];
        }
        if (isset(self::ITEM_IMAGE_MAP[$handleKey]) && isset(self::WEB_IMAGES[self::ITEM_IMAGE_MAP[$handleKey]])) {
            return self::WEB_IMAGES[self::ITEM_IMAGE_MAP[$handleKey]];
        }
        if (isset(self::ITEM_IMAGE_MAP[$nameKey]) && isset(self::WEB_IMAGES[self::ITEM_IMAGE_MAP[$nameKey]])) {
            return self::WEB_IMAGES[self::ITEM_IMAGE_MAP[$nameKey]];
        }
        foreach (array_keys(self::WEB_IMAGES) as $keyword) {
            if ($keyword !== 'food' && (str_contains($nameKey, $keyword) || str_contains($handleKey, str_replace(' ', '-', $keyword)))) {
                return self::WEB_IMAGES[$keyword];
            }
        }
        $fallback = [
            'shorteats' => 'fritter', 'drinks_hot' => 'tea', 'drinks_cold' => 'soda',
            'fast_food' => 'burger', 'sweet_treats' => 'pastry', 'other' => 'food',
        ];
        $key = $fallback[$imageKey] ?? 'food';

        return self::WEB_IMAGES[$key];
    }

    public function run(): void
    {
        Item::query()->forceDelete();
        Category::query()->delete();

        $food = Category::create([
            'name' => 'Food',
            'slug' => 'food',
            'parent_id' => null,
            'is_active' => true,
            'sort_order' => 1,
            'image_url' => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.49-ffb9abd7-f645-48ef-a78b-f1b36191f0b3.png',
        ]);

        $drinks = Category::create([
            'name' => 'Drinks',
            'slug' => 'drinks',
            'parent_id' => null,
            'is_active' => true,
            'sort_order' => 2,
            'image_url' => '/images/cafe/WhatsApp_Image_2026-01-30_at_19.34.55__1_-a88c997c-ebaa-4efc-a50d-11b8b178fd36.png',
        ]);

        $shorteats = Category::create([
            'parent_id' => $food->id,
            'name' => 'Shorteats',
            'slug' => 'shorteats',
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $fastFood = Category::create([
            'parent_id' => $food->id,
            'name' => 'Fast food',
            'slug' => 'fast-food',
            'is_active' => true,
            'sort_order' => 2,
        ]);

        $sweetTreats = Category::create([
            'parent_id' => $food->id,
            'name' => 'Sweet treats',
            'slug' => 'sweet-treats',
            'is_active' => true,
            'sort_order' => 3,
        ]);

        $other = Category::create([
            'parent_id' => $food->id,
            'name' => 'Other',
            'slug' => 'other',
            'is_active' => true,
            'sort_order' => 4,
        ]);

        $hotDrinks = Category::create([
            'parent_id' => $drinks->id,
            'name' => 'Hot Drinks',
            'slug' => 'hot-drinks',
            'is_active' => true,
            'sort_order' => 1,
        ]);

        $coldDrinks = Category::create([
            'parent_id' => $drinks->id,
            'name' => 'Cold Drinks',
            'slug' => 'cold-drinks',
            'is_active' => true,
            'sort_order' => 2,
        ]);

        $categoryMap = [
            'Shorteats' => ['id' => $shorteats->id, 'image_key' => 'shorteats'],
            'Fast food' => ['id' => $fastFood->id, 'image_key' => 'fast_food'],
            'Sweet treats' => ['id' => $sweetTreats->id, 'image_key' => 'sweet_treats'],
            'Drinks' => ['id' => null, 'image_key' => 'drinks_hot'], // resolved per item
            '' => ['id' => $other->id, 'image_key' => 'other'],
        ];

        $hotKeywords = ['tea', 'coffee', 'espresso', 'cappuccino', 'latte', 'lavaza', 'illy', 'cardamom', 'masala', 'milk coffee', 'milk tea', 'bombe tea', 'black tea', 'black coffee', 'lemon tea'];

        $csvPath = database_path('seeders/export_items.csv');
        if (!file_exists($csvPath)) {
            $this->command->error("CSV not found: {$csvPath}");

            return;
        }

        $file = fopen($csvPath, 'r');
        $headers = fgetcsv($file);
        $itemCount = 0;

        while (($row = fgetcsv($file)) !== false) {
            if (count($row) < 4) {
                continue;
            }
            $data = array_combine($headers, $row);
            $name = trim($data['Name'] ?? '');
            $priceRaw = $data['Price [Bake & Grill]'] ?? '';
            if ($name === '' || $priceRaw === '') {
                continue;
            }
            $price = (float) preg_replace('/[^0-9.]/', '', $priceRaw);
            if ($price <= 0) {
                continue;
            }

            $categoryName = trim($data['Category'] ?? '');
            $categoryEntry = $categoryMap[$categoryName] ?? $categoryMap[''];

            if ($categoryName === 'Drinks') {
                $nameLower = strtolower($name);
                $isHot = false;
                foreach ($hotKeywords as $kw) {
                    if (str_contains($nameLower, $kw)) {
                        $isHot = true;
                        break;
                    }
                }
                $categoryId = $isHot ? $hotDrinks->id : $coldDrinks->id;
                $imageKey = $isHot ? 'drinks_hot' : 'drinks_cold';
            } else {
                $categoryId = $categoryEntry['id'];
                $imageKey = $categoryEntry['image_key'];
            }

            $handle = trim($data['Handle'] ?? '');
            $imageUrl = self::getRelevantImageUrl($name, $handle, $imageKey);

            $sku = trim($data['SKU'] ?? '');
            $barcode = trim($data['Barcode'] ?? '') ?: null;
            $available = ($data['Available for sale [Bake & Grill]'] ?? '') === 'Y';

            $description = trim($data['Description'] ?? '') ?: null;
            if (in_array($name, ['Bileh ari', 'Bileh gandu'], true)) {
                $description = 'Betel (bileh).';
            }

            Item::create([
                'category_id' => $categoryId,
                'name' => $name,
                'sku' => $sku ?: null,
                'barcode' => $barcode,
                'description' => $description,
                'base_price' => $price,
                'cost' => 0,
                'tax_rate' => 0,
                'is_active' => true,
                'is_available' => $available,
                'image_url' => $imageUrl,
                'sort_order' => $itemCount,
            ]);
            $itemCount++;
        }
        fclose($file);

        $this->command->info("Imported {$itemCount} items with categories, subcategories, prices, and relevant photos.");
    }
}
