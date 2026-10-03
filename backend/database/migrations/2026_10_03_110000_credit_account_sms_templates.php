<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Owner, 2026-10-03: "add account approved, and any changes to the credit
 * amount notified". The two texts' wording, editable under SMS templates.
 * Data only; an owner's edited copy is never overwritten.
 */
return new class extends Migration
{
    private const SLUGS = ['customer_credit_approved', 'customer_credit_limit_changed'];

    public function up(): void
    {
        $now = now();
        foreach ([
            [
                'slug' => 'customer_credit_approved',
                'name' => 'Credit account approved (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: your credit account is approved. Limit MVR {{limit}}, pay each invoice within {{terms_days}} days. Thank you!',
                'description' => 'Sent when a customer\'s credit account is opened, or reopened after being blocked.',
                'variables' => json_encode([
                    ['name' => 'limit', 'description' => 'Credit limit in MVR'],
                    ['name' => 'terms_days', 'description' => 'Days to pay each invoice'],
                    ['name' => 'available', 'description' => 'Credit available now in MVR'],
                ]),
            ],
            [
                'slug' => 'customer_credit_limit_changed',
                'name' => 'Credit limit changed (customer)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: your credit limit has been {{change}} from MVR {{old_limit}} to MVR {{limit}}. Available now: MVR {{available}}.',
                'description' => 'Sent when an open credit account\'s limit goes up or down.',
                'variables' => json_encode([
                    ['name' => 'change', 'description' => '"increased" or "reduced"'],
                    ['name' => 'old_limit', 'description' => 'Previous credit limit in MVR'],
                    ['name' => 'limit', 'description' => 'New credit limit in MVR'],
                    ['name' => 'available', 'description' => 'Credit available now in MVR'],
                ]),
            ],
        ] as $template) {
            if (DB::table('sms_templates')->where('slug', $template['slug'])->exists()) {
                continue;
            }
            DB::table('sms_templates')->insert($template + ['is_system' => true, 'created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        DB::table('sms_templates')->whereIn('slug', self::SLUGS)->delete();
    }
};
