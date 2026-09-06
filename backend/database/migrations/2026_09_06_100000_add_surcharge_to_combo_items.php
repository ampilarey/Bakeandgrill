<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What an optional bundle extra costs.
 *
 * Owner's audit, 2026-09-06 (F5): `combo_items.is_optional` rendered as
 * "(optional)" beside a child in the order app and did nothing else — the
 * customer could not opt in or out, nothing recorded whether they took it,
 * and its stock was never deducted. Making the choice real needs somewhere to
 * say what taking it costs, and there was no such column.
 *
 * Defaults to 0, which is the behaviour every existing bundle has today: the
 * extra is included in the bundle's price. An owner who means "add a drink for
 * MVR 15" now has a place to put the 15.
 *
 * Mirrors `platter_group_items.surcharge`, deliberately — the two are the same
 * idea and the order path treats them the same way.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('combo_items', function (Blueprint $table): void {
            $table->decimal('surcharge', 10, 2)->default(0)->after('is_optional');
        });
    }

    public function down(): void
    {
        Schema::table('combo_items', function (Blueprint $table): void {
            $table->dropColumn('surcharge');
        });
    }
};
