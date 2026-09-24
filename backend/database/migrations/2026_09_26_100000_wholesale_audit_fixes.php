<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Wholesale audit follow-up, 2026-09-26.
 *
 * A credit note on a paid invoice used to drop the payment: the balance was
 * clamped at zero and nothing recorded that the shop was now in credit. The
 * balance may go below zero now (credit in hand), so the two balance columns
 * become signed. A partial credit note and a write-off each reduce the
 * invoice they cover (`credited_laar`, `written_off_laar`) so the ageing
 * report and both statements stop showing debt that no longer exists.
 * Overdue owner alerts are staged per invoice; unreconciled deliveries get
 * a shop nudge and an owner alert once each; disputed or written-off
 * missing stock can be charged as well as waived; the billing cycle drives
 * an owner reminder. Six shop texts move to editable templates.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->bigInteger('credit_balance_laar')->default(0)->change();
        });
        Schema::table('customer_credit_ledger', function (Blueprint $table): void {
            $table->bigInteger('balance_after_laar')->change();
            $table->json('applied_invoices')->nullable()->after('notes');
        });
        Schema::table('invoices', function (Blueprint $table): void {
            $table->bigInteger('credited_laar')->default(0)->after('amount_paid_laar');
            $table->bigInteger('written_off_laar')->default(0)->after('credited_laar');
            $table->unsignedSmallInteger('overdue_alert_stage')->default(0)->after('due_date');
        });
        Schema::table('trade_deliveries', function (Blueprint $table): void {
            $table->timestamp('sales_nudged_at')->nullable()->after('reported_at');
            $table->timestamp('unreconciled_alerted_at')->nullable()->after('sales_nudged_at');
            $table->boolean('missing_charge_forced')->default(false)->after('missing_waived_by');
            $table->string('missing_force_reason', 500)->nullable()->after('missing_charge_forced');
            $table->foreignId('missing_forced_by')->nullable()->after('missing_force_reason')->constrained('users')->nullOnDelete();
        });
        Schema::table('trade_accounts', function (Blueprint $table): void {
            $table->timestamp('billing_reminded_at')->nullable()->after('delivery_days');
        });

        // Account terms follow the same 7–90 day range as the customer's.
        DB::table('trade_accounts')->whereNotNull('payment_terms_days')->where('payment_terms_days', '<', 7)->update(['payment_terms_days' => 7]);
        DB::table('trade_accounts')->whereNotNull('payment_terms_days')->where('payment_terms_days', '>', 90)->update(['payment_terms_days' => 90]);

        $now = now();
        foreach ([
            [
                'slug' => 'credit_reminder_upcoming',
                'name' => 'Credit invoice due soon (customer)',
                'type' => 'customer_notification',
                'body' => 'Bake & Grill: credit invoice {{invoice_number}} - MVR {{amount}} due on {{due_date}}. View: {{link}}',
                'description' => 'Sent three days before a credit invoice is due.',
                'variables' => json_encode([
                    ['name' => 'invoice_number', 'description' => 'Invoice number'],
                    ['name' => 'amount', 'description' => 'Balance due in MVR'],
                    ['name' => 'due_date', 'description' => 'Due date'],
                    ['name' => 'link', 'description' => 'Invoice link'],
                ]),
            ],
            [
                'slug' => 'credit_reminder_due_today',
                'name' => 'Credit invoice due today (customer)',
                'type' => 'customer_notification',
                'body' => 'Bake & Grill: credit payment due today - invoice {{invoice_number}}, MVR {{amount}}. View: {{link}}',
                'description' => 'Sent on the due date of a credit invoice.',
                'variables' => json_encode([
                    ['name' => 'invoice_number', 'description' => 'Invoice number'],
                    ['name' => 'amount', 'description' => 'Balance due in MVR'],
                    ['name' => 'link', 'description' => 'Invoice link'],
                ]),
            ],
            [
                'slug' => 'credit_reminder_overdue',
                'name' => 'Credit invoice overdue (customer)',
                'type' => 'customer_notification',
                'body' => 'Bake & Grill: credit invoice {{invoice_number}} is {{days_overdue}} days overdue (MVR {{amount}}, due {{due_date}}). View: {{link}}',
                'description' => 'Sent three days after the due date and then every few days while unpaid.',
                'variables' => json_encode([
                    ['name' => 'invoice_number', 'description' => 'Invoice number'],
                    ['name' => 'amount', 'description' => 'Balance due in MVR'],
                    ['name' => 'due_date', 'description' => 'Due date'],
                    ['name' => 'days_overdue', 'description' => 'Days past due'],
                    ['name' => 'link', 'description' => 'Invoice link'],
                ]),
            ],
            [
                'slug' => 'trade_invoice_raised_shop',
                'name' => 'Wholesale invoice raised (shop)',
                'type' => 'customer_notification',
                'body' => 'Bake & Grill: invoice {{invoice_number}} for {{shop_name}} is MVR {{amount}}, due {{due_date}}. View and pay: {{link}}',
                'description' => 'Sent to the shop when a wholesale invoice is raised.',
                'variables' => json_encode([
                    ['name' => 'shop_name', 'description' => 'Shop name'],
                    ['name' => 'invoice_number', 'description' => 'Invoice number'],
                    ['name' => 'amount', 'description' => 'Invoice total in MVR'],
                    ['name' => 'due_date', 'description' => 'Due date'],
                    ['name' => 'link', 'description' => 'Statement link'],
                ]),
            ],
            [
                'slug' => 'trade_statement_shop',
                'name' => 'Monthly wholesale statement (shop)',
                'type' => 'customer_notification',
                'body' => 'Bake & Grill statement for {{month}}: {{shop_name}} owes MVR {{owed}}{{overdue_line}}. View and pay: {{link}}',
                'description' => 'Sent on the first of the month to every shop with a balance.',
                'variables' => json_encode([
                    ['name' => 'shop_name', 'description' => 'Shop name'],
                    ['name' => 'month', 'description' => 'Statement month'],
                    ['name' => 'owed', 'description' => 'Balance owed in MVR'],
                    ['name' => 'overdue_line', 'description' => '", of which MVR x is overdue" or empty'],
                    ['name' => 'link', 'description' => 'Statement link'],
                ]),
            ],
            [
                'slug' => 'trade_report_reminder_shop',
                'name' => 'Wholesale sales report reminder (shop)',
                'type' => 'customer_notification',
                'body' => 'Bake & Grill: please tell us what sold from delivery {{delivery_number}} ({{item_summary}}) so we can collect the rest. {{link}}',
                'description' => 'Sent once when a delivery is past its expected return and the shop has not reported sales.',
                'variables' => json_encode([
                    ['name' => 'delivery_number', 'description' => 'Delivery number'],
                    ['name' => 'item_summary', 'description' => 'What was delivered'],
                    ['name' => 'link', 'description' => 'Delivery link'],
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
        DB::table('sms_templates')->whereIn('slug', [
            'credit_reminder_upcoming', 'credit_reminder_due_today', 'credit_reminder_overdue',
            'trade_invoice_raised_shop', 'trade_statement_shop', 'trade_report_reminder_shop',
        ])->delete();
        Schema::table('trade_accounts', function (Blueprint $table): void {
            $table->dropColumn('billing_reminded_at');
        });
        Schema::table('trade_deliveries', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('missing_forced_by');
            $table->dropColumn(['sales_nudged_at', 'unreconciled_alerted_at', 'missing_charge_forced', 'missing_force_reason']);
        });
        Schema::table('invoices', function (Blueprint $table): void {
            $table->dropColumn(['credited_laar', 'written_off_laar', 'overdue_alert_stage']);
        });
        Schema::table('customer_credit_ledger', function (Blueprint $table): void {
            $table->dropColumn('applied_invoices');
            $table->unsignedBigInteger('balance_after_laar')->change();
        });
        Schema::table('customers', function (Blueprint $table): void {
            $table->unsignedBigInteger('credit_balance_laar')->default(0)->change();
        });
    }
};
