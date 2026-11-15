<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What bills call things (owner, 2026-11-15: one shop's branches write different
 * names, and so do items): the wording on a bill, and the supplier or inventory item a
 * person settled on for it. Learned when a bill is saved, used when the next is read.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bill_names', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 10); // shop | item
            $table->string('key', 191); // the wording, folded: lower case, letters and digits only
            $table->string('text'); // as it was written
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->nullable()->constrained('inventory_items')->cascadeOnDelete();
            $table->unsignedInteger('uses')->default(1);
            $table->timestamps();
            $table->unique(['kind', 'key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bill_names');
    }
};
