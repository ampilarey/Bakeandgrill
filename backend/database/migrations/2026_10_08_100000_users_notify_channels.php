<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\NotificationChannels;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which channels a staff member's alerts go by (owner, 2026-10-07: "admin
 * decides in which channel notifications goes to a specific role or
 * person"). Null follows their role's channels in Admin → SMS Control
 * Center → Who gets alerts, and how.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('notify_channels')->nullable();
        });

        // The single "Telegram instead of SMS" switch this replaces: where it
        // was on, every role starts on email + Telegram (the SMS still goes
        // when neither reaches the person, as it did).
        $old = DB::table('site_settings')->where('key', 'telegram_alerts_instead_of_sms')->value('value');
        if (in_array(strtolower(trim((string) $old)), ['1', 'true', 'on', 'yes'], true)
            && !DB::table('site_settings')->where('key', NotificationChannels::SETTING_ROLES)->exists()) {
            $roles = [];
            foreach (DB::table('roles')->pluck('slug') as $slug) {
                $roles[(string) $slug] = [NotificationChannels::EMAIL, NotificationChannels::TELEGRAM];
            }
            SiteSetting::set(NotificationChannels::SETTING_ROLES, json_encode($roles));
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('notify_channels');
        });
    }
};
