<?php

declare(strict_types=1);

use App\Domains\Labels\LabelSettings;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Label Hub v2, step 1 (docs/LABEL_HUB_V2_PLAN.md). Owner, 2026-10-04:
 * "option to add different labels in the sticker, for example frozen hedika
 * is a type of food so that label should be easily selected" and "option to
 * add different brand and its logo. For example amma brand is a specific food
 * under bake and grill".
 *
 * A brand is who the label is from; a label type is what kind of food it is
 * and carries the wording for it. Items pick a type. The three first types
 * are the v1 per-storage wording, so nothing already printing changes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('label_brands', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60);
            $table->string('name_dv', 60)->nullable();
            $table->string('tagline', 80)->nullable();
            $table->string('tagline_dv', 80)->nullable();
            $table->foreignId('logo_media_id')->nullable()->constrained('media_assets')->nullOnDelete();
            // The default brand is the business itself: its details come from Business Details.
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('label_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('brand_id')->nullable()->constrained('label_brands')->nullOnDelete();
            $table->string('name', 60);
            $table->string('heading', 40);
            $table->string('heading_dv', 40)->nullable();
            $table->string('storage', 16)->default('frozen');
            $table->string('storage_line', 160)->nullable();
            $table->string('storage_line_dv', 160)->nullable();
            $table->string('use_within', 80)->nullable();
            $table->string('use_within_dv', 80)->nullable();
            $table->string('mfg_label', 20)->default('MFG DATE');
            $table->string('exp_label', 20)->default('EXP DATE');
            $table->string('how_to_use', 200)->nullable();
            $table->string('how_to_use_dv', 200)->nullable();
            $table->string('note', 120)->nullable();
            $table->string('note_dv', 120)->nullable();
            $table->unsignedSmallInteger('shelf_life_days')->nullable();
            $table->boolean('show_qr')->default(true);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort')->default(0);
            $table->timestamps();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->foreignId('label_type_id')->nullable()->after('label_storage')->constrained('label_types')->nullOnDelete();
            $table->string('label_how_to_use', 200)->nullable()->after('label_note_dv');
            $table->string('label_how_to_use_dv', 200)->nullable()->after('label_how_to_use');
        });

        $now = now();
        $brand = DB::table('label_brands')->insertGetId(['name' => 'Bake & Grill', 'is_default' => true, 'sort' => 0, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('label_brands')->insert(['name' => 'Amma', 'tagline' => 'Home-made, the Amma way', 'is_default' => false, 'sort' => 1, 'created_at' => $now, 'updated_at' => $now]);

        // The v1 wording (with any changes the owner made in Settings) becomes
        // the first three types; an item without a type falls back to the
        // same wording, so every sticker prints as before.
        $get = function (string $key): string {
            try {
                return LabelSettings::get($key);
            } catch (\Throwable) {
                return LabelSettings::DEFAULTS[$key] ?? '';
            }
        };
        $types = [
            ['Frozen Hedhika', 'frozen', $get('label_header_line'), $get('label_header_line_dv'), $get('label_storage_frozen'), $get('label_storage_frozen_dv'), null, null, 90],
            ['Chilled Hedhika', 'chilled', $get('label_header_line_chilled'), $get('label_header_line_chilled_dv'), $get('label_storage_chilled'), $get('label_storage_chilled_dv'), 'Use within 2 days of opening', 'ހުޅުވުމަށްފަހު 2 ދުވަހުގެ ތެރޭގައި ބޭނުންކުރައްވާ', 3],
            ['Fresh Hedhika', 'ambient', $get('label_header_line_ambient'), $get('label_header_line_ambient_dv'), $get('label_storage_ambient'), $get('label_storage_ambient_dv'), 'Best eaten the same day', 'އެންމެ ރަނގަޅީ އެދުވަހު ކެއުން', 1],
        ];
        foreach ($types as $i => [$name, $storage, $h, $hDv, $line, $lineDv, $within, $withinDv, $life]) {
            DB::table('label_types')->insert([
                'brand_id' => $brand, 'name' => $name, 'heading' => $h, 'heading_dv' => $hDv ?: null, 'storage' => $storage,
                'storage_line' => $line ?: null, 'storage_line_dv' => $lineDv ?: null, 'use_within' => $within, 'use_within_dv' => $withinDv,
                'mfg_label' => 'MFG DATE', 'exp_label' => $storage === 'frozen' ? 'EXP DATE' : 'BEST BEFORE', 'shelf_life_days' => $life,
                'show_qr' => true, 'is_active' => true, 'sort' => $i, 'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        // Items already on labels get the type that matches their storage.
        foreach (['frozen', 'chilled', 'ambient'] as $storage) {
            $id = DB::table('label_types')->where('storage', $storage)->orderBy('sort')->value('id');
            if ($id) {
                DB::table('items')->where('label_enabled', true)->where('label_storage', $storage)->whereNull('label_type_id')->update(['label_type_id' => $id]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('label_type_id');
            $table->dropColumn(['label_how_to_use', 'label_how_to_use_dv']);
        });
        Schema::dropIfExists('label_types');
        Schema::dropIfExists('label_brands');
    }
};
