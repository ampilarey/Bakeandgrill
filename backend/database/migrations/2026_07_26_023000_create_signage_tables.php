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
        Schema::create('signage_playlists', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('store_id')->nullable()->index();
            $table->string('name');
            $table->json('slides')->nullable();
            $table->json('theme')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('signage_groups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('store_id')->nullable()->index();
            $table->string('name');
            $table->foreignId('playlist_id')->nullable()->constrained('signage_playlists')->nullOnDelete();
            $table->json('theme')->nullable();
            $table->string('orientation', 16)->default('landscape'); // landscape|portrait
            $table->unsignedInteger('refresh_seconds')->default(120);
            $table->timestamps();
        });

        Schema::create('signage_screens', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('store_id')->nullable()->index();
            $table->string('name');
            $table->string('slug')->unique();
            $table->foreignId('group_id')->nullable()->constrained('signage_groups')->nullOnDelete();
            $table->foreignId('playlist_id')->nullable()->constrained('signage_playlists')->nullOnDelete();
            $table->string('orientation', 16)->nullable();
            $table->string('resolution', 32)->nullable(); // e.g. 1920x1080
            $table->unsignedInteger('refresh_seconds')->nullable();
            $table->json('fallback')->nullable();
            $table->json('overrides')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('signage_campaigns', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('store_id')->nullable()->index();
            $table->string('name');
            $table->foreignId('playlist_id')->nullable()->constrained('signage_playlists')->nullOnDelete();
            $table->json('slides')->nullable();
            $table->date('date_start')->nullable();
            $table->date('date_end')->nullable();
            $table->json('days')->nullable(); // 0–6
            $table->json('windows')->nullable(); // [{start,end}]
            $table->unsignedInteger('priority')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $now = now();
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'signage.manage'],
            [
                'name' => 'Manage TV signage',
                'group' => 'Marketing',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        );
        $permissionId = (int) DB::table('permissions')->where('slug', 'signage.manage')->value('id');
        $ownerId = (int) DB::table('roles')->where('slug', 'owner')->value('id');
        $managerId = (int) DB::table('roles')->where('slug', 'manager')->value('id');
        if ($permissionId > 0 && $ownerId > 0) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $ownerId, 'permission_id' => $permissionId],
                [],
            );
        }
        if ($permissionId > 0 && $managerId > 0) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $managerId, 'permission_id' => $permissionId],
                [],
            );
        }

        foreach ([
            ['key' => 'signage_emergency', 'value' => 'none', 'type' => 'text', 'group' => 'Signage', 'label' => 'Signage emergency mode', 'is_public' => false],
            ['key' => 'signage_prayer', 'value' => json_encode([
                'enabled' => true,
                'prayers' => ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
                'break_minutes' => 15,
            ], JSON_UNESCAPED_UNICODE), 'type' => 'json', 'group' => 'Signage', 'label' => 'Signage prayer break', 'is_public' => false],
            ['key' => 'signage_wifi_name', 'value' => '', 'type' => 'text', 'group' => 'Signage', 'label' => 'Guest Wi‑Fi name', 'is_public' => true],
            ['key' => 'signage_wifi_password', 'value' => '', 'type' => 'text', 'group' => 'Signage', 'label' => 'Guest Wi‑Fi password', 'is_public' => true],
        ] as $row) {
            $attrs = ['key' => $row['key']];
            if (Schema::hasColumn('site_settings', 'scope')) {
                $attrs['scope'] = 'shared';
            }
            if (Schema::hasColumn('site_settings', 'locale')) {
                $attrs['locale'] = 'en';
            }
            $payload = [
                'value' => $row['value'],
                'type' => $row['type'],
                'group' => $row['group'],
                'label' => $row['label'],
                'is_public' => $row['is_public'],
                'updated_at' => $now,
            ];
            if (Schema::hasColumn('site_settings', 'created_at')) {
                $payload['created_at'] = $now;
            }
            DB::table('site_settings')->updateOrInsert($attrs, $payload);
        }

        // Seed default playlist / group / screen
        $defaultTheme = [
            'primary' => '#D4813A',
            'background' => '#1C1408',
            'surface' => '#2A2118',
            'text' => '#FFF8F0',
            'muted' => '#C4B5A5',
            'font_display' => 'Georgia, serif',
            'font_body' => 'system-ui, sans-serif',
        ];

        $slides = \App\Domains\Signage\Services\SignageTemplateFactory::defaultPlaylistSlides();

        $playlistId = DB::table('signage_playlists')->insertGetId([
            'store_id' => null,
            'name' => 'Default Board',
            'slides' => json_encode($slides, JSON_UNESCAPED_UNICODE),
            'theme' => json_encode($defaultTheme, JSON_UNESCAPED_UNICODE),
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $groupId = DB::table('signage_groups')->insertGetId([
            'store_id' => null,
            'name' => 'Dining TVs',
            'playlist_id' => $playlistId,
            'theme' => null,
            'orientation' => 'landscape',
            'refresh_seconds' => 120,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('signage_screens')->insert([
            'store_id' => null,
            'name' => 'Main Dining',
            'slug' => 'default',
            'group_id' => $groupId,
            'playlist_id' => null,
            'orientation' => 'landscape',
            'resolution' => '1920x1080',
            'refresh_seconds' => 120,
            'fallback' => null,
            'overrides' => null,
            'is_default' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('signage_campaigns');
        Schema::dropIfExists('signage_screens');
        Schema::dropIfExists('signage_groups');
        Schema::dropIfExists('signage_playlists');

        $permissionId = (int) DB::table('permissions')->where('slug', 'signage.manage')->value('id');
        if ($permissionId > 0) {
            DB::table('role_permission')->where('permission_id', $permissionId)->delete();
            DB::table('user_permission')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }

        DB::table('site_settings')->whereIn('key', [
            'signage_emergency',
            'signage_prayer',
            'signage_wifi_name',
            'signage_wifi_password',
        ])->delete();
    }
};
