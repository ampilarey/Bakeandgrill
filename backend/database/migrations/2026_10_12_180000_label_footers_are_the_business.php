<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Owner, 2026-10-12: "Footer should be always branding of Bake and Grill.
 * Amma is a food brand label but the actual brand is under Bake and Grill,
 * so its branding should be used in the footer."
 *
 * A footer no longer belongs to a brand and has no by-line: every blank line
 * prints the business's own value from Business Details, whatever food brand
 * is on the header. The footers seeded one per sub-brand (all lines blank,
 * which only ever meant "that brand's lines") go; labels and types that
 * printed one print the standard footer instead. A footer with words of its
 * own typed in keeps them.
 */
return new class extends Migration
{
    public function up(): void
    {
        $textLines = ['heading', 'heading_dv', 'tagline', 'tagline_dv', 'by_line', 'phone', 'ways', 'ways_dv', 'website', 'address', 'address_dv', 'landmark', 'landmark_dv'];
        $mirrors = DB::table('label_footers')->whereNotNull('brand_id')->where('is_default', false)
            ->where(function ($q) use ($textLines) {
                foreach ($textLines as $col) {
                    $q->where(fn ($w) => $w->whereNull($col)->orWhere($col, ''));
                }
            })
            ->pluck('id')->all();
        if ($mirrors !== []) {
            DB::table('custom_labels')->whereIn('footer_id', $mirrors)->update(['footer_id' => null]);
            DB::table('label_types')->whereIn('footer_id', $mirrors)->update(['footer_id' => null]);
            DB::table('label_footers')->whereIn('id', $mirrors)->delete();
        }

        Schema::table('label_footers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('brand_id');
        });
        Schema::table('label_footers', function (Blueprint $table) {
            $table->dropColumn(['by_line', 'show_by']);
        });
    }

    public function down(): void
    {
        Schema::table('label_footers', function (Blueprint $table) {
            $table->foreignId('brand_id')->nullable()->after('name')->constrained('label_brands')->nullOnDelete();
            $table->string('by_line', 60)->nullable()->after('tagline_dv');
            $table->boolean('show_by')->default(true)->after('by_line');
        });
    }
};
