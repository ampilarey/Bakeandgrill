<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sms_contact_group_members', function (Blueprint $table) {
            $table->foreignId('group_id')->constrained('sms_contact_groups')->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained('sms_contacts')->cascadeOnDelete();

            $table->primary(['group_id', 'contact_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_contact_group_members');
    }
};
