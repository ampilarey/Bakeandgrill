<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An invoice made from a customer's purchase order (owner, 2026-11-15: "a place
 * where I can upload PO and generate invoice"): the PO's number, the PO file
 * itself, and where and when the goods are to be delivered.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->string('po_number', 80)->nullable()->index();
            $table->string('po_file_path')->nullable();
            $table->text('deliver_to')->nullable();
            $table->date('delivery_date')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            $table->dropIndex(['po_number']);
            $table->dropColumn(['po_number', 'po_file_path', 'deliver_to', 'delivery_date']);
        });
    }
};
