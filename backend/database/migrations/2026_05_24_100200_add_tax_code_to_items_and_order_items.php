<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('tax_code', 20)->default('standard_8')->after('tax_rate');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->string('tax_code', 20)->default('standard_8')->after('tax_rate');
        });

        // Legacy: items with explicit tax_rate > 0 are standard-rated; zero rate = out of scope.
        DB::table('items')->where('tax_rate', '>', 0)->update(['tax_code' => 'standard_8']);
        DB::table('items')->where('tax_rate', '<=', 0)->update(['tax_code' => 'out_of_scope']);

        DB::table('order_items')->where('tax_rate', '>', 0)->update(['tax_code' => 'standard_8']);
        DB::table('order_items')->where('tax_rate', '<=', 0)->update(['tax_code' => 'out_of_scope']);
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('tax_code');
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->dropColumn('tax_code');
        });
    }
};
