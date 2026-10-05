<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Owner, 2026-10-05: the Credit accounts page texts a customer a reminder of
 * their balance or a link to pay an invoice online. The wording of those
 * two texts, editable under SMS templates. Data only; an edited copy is
 * never overwritten.
 */
return new class extends Migration
{
    private const SLUGS = ['credit_balance_reminder', 'credit_pay_link'];

    public function up(): void
    {
        $now = now();
        $variables = [
            ['name' => 'name', 'description' => 'Customer name'],
            ['name' => 'balance', 'description' => 'Credit balance owed in MVR'],
            ['name' => 'invoice_number', 'description' => 'Oldest open invoice number (blank when none)'],
            ['name' => 'amount', 'description' => 'Amount still due on that invoice in MVR'],
            ['name' => 'due_date', 'description' => 'That invoice\'s due date'],
            ['name' => 'link', 'description' => 'Link to the invoice page'],
        ];
        foreach ([
            [
                'slug' => 'credit_balance_reminder',
                'name' => 'Credit balance reminder (manual, no invoice)',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: your credit account balance is MVR {{balance}}. Please settle at your earliest convenience. Thank you!',
                'description' => 'Sent from Customers → Credit accounts → Send reminder when the customer owes a balance with no open invoice.',
                'variables' => json_encode($variables),
            ],
            [
                'slug' => 'credit_pay_link',
                'name' => 'Credit invoice pay link',
                'type' => 'order_notification',
                'body' => 'Bake & Grill: pay credit invoice {{invoice_number}} (MVR {{amount}}) online by card: {{link}} - thank you!',
                'description' => 'Sent from Customers → Credit accounts → Send pay link. The link opens the invoice with a Pay online button.',
                'variables' => json_encode($variables),
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
