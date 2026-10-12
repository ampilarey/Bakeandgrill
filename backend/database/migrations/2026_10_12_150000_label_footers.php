<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Owner, 2026-10-12: "No easy option to select and edit branding footer."
 * A footer is now a preset of its own: the name it prints big, tagline, who
 * it is by, phone, ways to reach you, website, address and landmark (each in
 * English and Dhivehi), the complaints QR and the brand mark. Blank lines
 * take the brand's and Business Details' live values. A custom label, a label
 * type (as its default) and a whole sheet can pick one.
 *
 * Seeded: "Standard" (the business itself) and one per brand under it. A
 * custom label that printed the standard footer points at Standard; one that
 * printed its own words gets a footer of its own carrying them as the
 * tagline; one that printed its brand's keeps printing it (no footer picked).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('label_footers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60);
            $table->foreignId('brand_id')->nullable()->constrained('label_brands')->nullOnDelete();
            $table->string('heading', 60)->nullable();
            $table->string('heading_dv', 60)->nullable();
            $table->string('tagline', 120)->nullable();
            $table->string('tagline_dv', 120)->nullable();
            $table->string('by_line', 60)->nullable();
            $table->boolean('show_by')->default(true);
            $table->string('phone', 40)->nullable();
            $table->string('ways', 80)->nullable();
            $table->string('ways_dv', 80)->nullable();
            $table->string('website', 80)->nullable();
            $table->string('address', 120)->nullable();
            $table->string('address_dv', 120)->nullable();
            $table->string('landmark', 80)->nullable();
            $table->string('landmark_dv', 80)->nullable();
            $table->boolean('show_qr')->default(true);
            $table->boolean('show_mark')->default(true);
            $table->boolean('is_default')->default(false);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->foreignId('footer_id')->nullable()->after('label_footer_dv')->constrained('label_footers')->nullOnDelete();
        });
        Schema::table('label_types', function (Blueprint $table) {
            $table->foreignId('footer_id')->nullable()->after('show_qr')->constrained('label_footers')->nullOnDelete();
        });

        $now = now();
        $row = fn (array $values) => $values + ['created_at' => $now, 'updated_at' => $now];
        $standard = DB::table('label_footers')->insertGetId($row(['name' => 'Standard', 'is_default' => true, 'sort' => 0]));
        $byBrand = [];
        foreach (DB::table('label_brands')->where('is_default', false)->orderBy('sort')->orderBy('id')->get() as $i => $brand) {
            $byBrand[$brand->id] = DB::table('label_footers')->insertGetId($row(['name' => $brand->name, 'brand_id' => $brand->id, 'sort' => $i + 1]));
        }

        $typeBrands = DB::table('label_types')->pluck('brand_id', 'id');
        foreach (DB::table('custom_labels')->orderBy('id')->get() as $label) {
            $style = (string) ($label->label_footer_style ?? 'brand');
            $own = trim((string) $label->label_footer);
            $ownDv = trim((string) $label->label_footer_dv);
            if ($style === 'standard') {
                DB::table('custom_labels')->where('id', $label->id)->update(['footer_id' => $standard]);
            } elseif ($style === 'own' && ($own !== '' || $ownDv !== '')) {
                $brandId = $label->brand_id ?: ($label->label_type_id ? ($typeBrands[$label->label_type_id] ?? null) : null);
                $brandIsDefault = $brandId !== null && DB::table('label_brands')->where('id', $brandId)->value('is_default');
                $id = DB::table('label_footers')->insertGetId($row([
                    'name' => mb_substr($label->name . ' footer', 0, 60),
                    'brand_id' => $brandIsDefault ? null : $brandId,
                    'tagline' => $own !== '' ? $own : null,
                    'tagline_dv' => $ownDv !== '' ? $ownDv : null,
                    'sort' => 50,
                ]));
                DB::table('custom_labels')->where('id', $label->id)->update(['footer_id' => $id]);
            }
        }

        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropColumn(['label_footer', 'label_footer_dv', 'label_footer_style']);
        });
    }

    public function down(): void
    {
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->string('label_footer', 120)->nullable();
            $table->string('label_footer_dv', 120)->nullable();
            $table->string('label_footer_style', 12)->default('brand');
        });
        Schema::table('custom_labels', function (Blueprint $table) {
            $table->dropConstrainedForeignId('footer_id');
        });
        Schema::table('label_types', function (Blueprint $table) {
            $table->dropConstrainedForeignId('footer_id');
        });
        Schema::dropIfExists('label_footers');
    }
};
