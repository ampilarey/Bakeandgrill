<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Packs that belong to a brand, and what that pack normally costs.
 *
 * Owner, 2026-09-12: "options to add different brands and packaging options to
 * each brand and default price to each brand. And when the default amount is
 * changed in manual po, the latest values automatically update in the system."
 *
 * Until now a pack belonged to the item, so every brand of ghee shared one
 * list: you could not say Amul comes in a 1 kg tin and Nestlé in a 500 g jar.
 * And nothing anywhere held a price — the buying screen could only offer what
 * the last purchase happened to be.
 *
 * Two changes:
 *
 *  - A pack may now name a brand. `brand_key` is the folded form (lower case,
 *    trimmed, runs of space collapsed) that InventoryBrandPhoto::keyFor()
 *    already produces, so "Amul", "amul" and "AMUL " are one brand here as
 *    they are there. Empty string means the pack belongs to the item rather
 *    than to any one brand, which is what every existing pack becomes — so
 *    nothing that works today stops working.
 *
 *  - A pack carries `default_unit_cost`: what a manual purchase order should
 *    open at. It is written by hand in the item editor and then kept honest
 *    by purchasing — entering a different price on a PO line updates it, with
 *    `default_cost_updated_at` recording when, so a price set months ago is
 *    visibly a price set months ago.
 *
 * The unique index moves with it. "Tin" was unique per item; it is now unique
 * per item per brand, because Amul's tin and Nestlé's tin are two different
 * boxes that happen to share a word.
 *
 * ── Why every step checks before it acts ─────────────────────────────────
 *
 * The first version of this file failed on production (2026-09-12) and left
 * the table half-changed. MariaDB does not roll DDL back: the four columns
 * were added and committed, the next statement failed, and the migration was
 * never recorded — so the re-run tried to add `brand` again and stopped at
 * "Duplicate column name". SQLite and PostgreSQL, which this had been tested
 * on, wrap the whole migration in a transaction and never show the problem.
 *
 * The statement that failed was dropping the old unique index. On InnoDB the
 * foreign key on `inventory_item_id` needs *some* index that starts with that
 * column, and the composite unique on (inventory_item_id, name) was the only
 * one — so dropping it is refused as "needed in a foreign key constraint".
 * PostgreSQL has no such rule. The fix is ordering: the new indexes, which
 * also start with `inventory_item_id`, are created first, so the constraint
 * has somewhere to move to before the old one goes.
 *
 * Together: this file can be run against a table in any of the states the
 * failure could have left it in, and does only what is still missing.
 */
return new class extends Migration
{
    private const TABLE = 'inventory_purchase_units';

    private const OLD_UNIQUE = 'inventory_purchase_units_inventory_item_id_name_unique';

    private const NEW_UNIQUE = 'purchase_units_item_brand_name_unique';

    private const NEW_INDEX = 'purchase_units_item_brand_index';

    public function up(): void
    {
        // 1. Columns — each on its own, since a partial first run may have
        //    left any prefix of them behind.
        Schema::table(self::TABLE, function (Blueprint $table) {
            if (!Schema::hasColumn(self::TABLE, 'brand')) {
                // Stored alongside the key so a screen can show the brand as
                // somebody typed it rather than as the lookup folds it.
                $table->string('brand')->nullable()->after('inventory_item_id');
            }
            if (!Schema::hasColumn(self::TABLE, 'brand_key')) {
                $table->string('brand_key', 190)->default('')->after('brand');
            }
            if (!Schema::hasColumn(self::TABLE, 'default_unit_cost')) {
                $table->decimal('default_unit_cost', 12, 2)->nullable()->after('base_units');
            }
            if (!Schema::hasColumn(self::TABLE, 'default_cost_updated_at')) {
                $table->timestamp('default_cost_updated_at')->nullable()->after('default_unit_cost');
            }
        });

        // 2. New indexes first. Both begin with inventory_item_id, so the
        //    foreign key can lean on them once the old unique is gone.
        if (!Schema::hasIndex(self::TABLE, self::NEW_INDEX)) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->index(['inventory_item_id', 'brand_key'], self::NEW_INDEX);
            });
        }
        if (!Schema::hasIndex(self::TABLE, self::NEW_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->unique(['inventory_item_id', 'brand_key', 'name'], self::NEW_UNIQUE);
            });
        }

        // 3. Only now is the old one safe to drop.
        if (Schema::hasIndex(self::TABLE, self::OLD_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->dropUnique(self::OLD_UNIQUE);
            });
        }
    }

    public function down(): void
    {
        /*
         * Reversing collapses brands back into one list per item, and two
         * brands that both call their box "Tin" would then collide on the
         * restored unique index. The brand-specific ones go; the shared ones
         * — which is everything that existed before this migration — stay.
         */
        if (Schema::hasColumn(self::TABLE, 'brand_key')) {
            DB::table(self::TABLE)->where('brand_key', '!=', '')->delete();
        }

        // Same rule in reverse: restore the old index before dropping the
        // ones the foreign key is currently leaning on.
        if (!Schema::hasIndex(self::TABLE, self::OLD_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->unique(['inventory_item_id', 'name'], self::OLD_UNIQUE);
            });
        }

        // PostgreSQL backs a unique index with a constraint and refuses a plain
        // DROP INDEX on it, so the two go by their own verbs.
        if (Schema::hasIndex(self::TABLE, self::NEW_UNIQUE)) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->dropUnique(self::NEW_UNIQUE);
            });
        }
        if (Schema::hasIndex(self::TABLE, self::NEW_INDEX)) {
            Schema::table(self::TABLE, function (Blueprint $table) {
                $table->dropIndex(self::NEW_INDEX);
            });
        }

        Schema::table(self::TABLE, function (Blueprint $table) {
            $drop = array_values(array_filter(
                ['brand', 'brand_key', 'default_unit_cost', 'default_cost_updated_at'],
                fn (string $column) => Schema::hasColumn(self::TABLE, $column),
            ));
            if ($drop !== []) {
                $table->dropColumn($drop);
            }
        });
    }
};
