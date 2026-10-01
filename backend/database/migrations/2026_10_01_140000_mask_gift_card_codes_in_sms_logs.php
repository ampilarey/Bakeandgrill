<?php

declare(strict_types=1);

use App\Domains\Notifications\Services\SmsService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Security audit, 2026-10-01: gift card texts were logged with the full code
 * and the link that shows it. New rows are masked as they are written; this
 * masks the rows already there. One-way on purpose: there is nothing to put
 * back.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sms_logs')) {
            return;
        }

        DB::table('sms_logs')
            ->where(fn ($q) => $q->where('type', 'giftcard_delivery')->orWhere('message', 'like', '%/gift-cards/v/%'))
            ->orderBy('id')
            ->select(['id', 'message'])
            ->chunkById(500, function ($rows): void {
                foreach ($rows as $row) {
                    $masked = SmsService::maskSecretsForLog((string) $row->message);
                    if ($masked !== $row->message) {
                        DB::table('sms_logs')->where('id', $row->id)->update(['message' => $masked]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Nothing to restore.
    }
};
