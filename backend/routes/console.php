<?php

use App\Models\Item;
use Database\Seeders\ImportMenuSeeder;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('menu:sync-item-images', function () {
    $map = ImportMenuSeeder::getLocalImageMap();
    $updated = 0;
    Item::chunk(100, function ($items) use ($map, &$updated) {
        foreach ($items as $item) {
            $nameKey = strtolower(trim($item->name));
            $handleKey = str_replace(' ', '-', $nameKey);
            $imageUrl = $map[$nameKey] ?? $map[$handleKey] ?? $map[str_replace([' ', '/'], ['-', '-'], $nameKey)] ?? null;
            if ($imageUrl !== null && $item->image_url !== $imageUrl) {
                $item->update(['image_url' => $imageUrl]);
                $updated++;
                $this->line("Updated: {$item->name} -> {$imageUrl}");
            }
        }
    });
    $this->info("Synced {$updated} item image(s) from local cafe photos.");
})->purpose('Set image_url for items that have local cafe photos so uploaded photos appear on the website');
