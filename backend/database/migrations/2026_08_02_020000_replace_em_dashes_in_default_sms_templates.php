<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Em dashes (U+2014) are outside GSM-7, so a short bill SMS becomes UCS-2
 * (70 chars/seg) instead of GSM-7 (160 chars/seg) — roughly double cost.
 *
 * Only rewrite rows whose body still matches the historical seeded default.
 * Admin-customised wording is left alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        $replacements = [
            [
                'slug' => 'customer_send_bill',
                'from' => 'Bill #{{invoice_number}} — MVR {{total}}. View: {{invoice_url}}',
                'to' => 'Bill #{{invoice_number}} - MVR {{total}}. View: {{invoice_url}}',
            ],
            [
                'slug' => 'customer_send_pay_link',
                'from' => "{{greeting}} Your Bake & Grill bill is ready to pay.\nAmount: MVR {{amount}}\nOrder: {{order_number}}\nView your order & pay: {{pay_url}}\nThanks — see you soon!",
                'to' => "{{greeting}} Your Bake & Grill bill is ready to pay.\nAmount: MVR {{amount}}\nOrder: {{order_number}}\nView your order & pay: {{pay_url}}\nThanks - see you soon!",
            ],
            [
                'slug' => 'catering_confirmed_customer',
                'from' => 'Event confirmed — ref {{reference}}, paid MVR {{paid}}{{balance_bit}}. {{when}}{{venue}}',
                'to' => 'Event confirmed - ref {{reference}}, paid MVR {{paid}}{{balance_bit}}. {{when}}{{venue}}',
            ],
        ];

        foreach ($replacements as $row) {
            DB::table('sms_templates')
                ->where('slug', $row['slug'])
                ->where('body', $row['from'])
                ->update([
                    'body' => $row['to'],
                    'updated_at' => now(),
                ]);
        }
    }

    public function down(): void
    {
        $replacements = [
            [
                'slug' => 'customer_send_bill',
                'from' => 'Bill #{{invoice_number}} - MVR {{total}}. View: {{invoice_url}}',
                'to' => 'Bill #{{invoice_number}} — MVR {{total}}. View: {{invoice_url}}',
            ],
            [
                'slug' => 'customer_send_pay_link',
                'from' => "{{greeting}} Your Bake & Grill bill is ready to pay.\nAmount: MVR {{amount}}\nOrder: {{order_number}}\nView your order & pay: {{pay_url}}\nThanks - see you soon!",
                'to' => "{{greeting}} Your Bake & Grill bill is ready to pay.\nAmount: MVR {{amount}}\nOrder: {{order_number}}\nView your order & pay: {{pay_url}}\nThanks — see you soon!",
            ],
            [
                'slug' => 'catering_confirmed_customer',
                'from' => 'Event confirmed - ref {{reference}}, paid MVR {{paid}}{{balance_bit}}. {{when}}{{venue}}',
                'to' => 'Event confirmed — ref {{reference}}, paid MVR {{paid}}{{balance_bit}}. {{when}}{{venue}}',
            ],
        ];

        foreach ($replacements as $row) {
            DB::table('sms_templates')
                ->where('slug', $row['slug'])
                ->where('body', $row['from'])
                ->update([
                    'body' => $row['to'],
                    'updated_at' => now(),
                ]);
        }
    }
};
