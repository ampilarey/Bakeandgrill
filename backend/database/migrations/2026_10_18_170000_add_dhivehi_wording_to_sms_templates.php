<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A customer message's own Dhivehi wording (iruali import plan, feature 3b). */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('sms_templates', 'body_dv')) {
            Schema::table('sms_templates', function (Blueprint $table): void {
                $table->text('body_dv')->nullable()->after('body');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('sms_templates', 'body_dv')) {
            Schema::table('sms_templates', function (Blueprint $table): void {
                $table->dropColumn('body_dv');
            });
        }
    }
};
