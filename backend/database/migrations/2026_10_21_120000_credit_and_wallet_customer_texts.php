<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\SmsTemplateWording;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Credit and wallet money texts (owner, 2026-10-21): a sale on credit told by
 * its own text in place of the receipt text, a repayment acknowledged, the
 * wallet speaking when money is added, paid out, put on hold or active again,
 * and the reminders saying Pay online with the whole balance beside the one
 * invoice. A reminder wording the owner edited is left as it is.
 */
return new class extends Migration
{
    private const NEW_SLUGS = [
        'customer_credit_charged',
        'customer_credit_repayment',
        'customer_credit_repayment_settled',
        'customer_deposit_received',
        'customer_deposit_paid_out',
        'customer_deposit_on_hold',
        'customer_deposit_active',
    ];

    public function up(): void
    {
        $creditVars = [
            ['name' => 'amount', 'description' => 'Amount charged to the account in MVR'],
            ['name' => 'order_number', 'description' => 'Order number'],
            ['name' => 'invoice_number', 'description' => 'Invoice number'],
            ['name' => 'due_date', 'description' => 'When the invoice is due'],
            ['name' => 'balance', 'description' => 'Balance owed on the account in MVR'],
            ['name' => 'available', 'description' => 'Credit still available in MVR'],
            ['name' => 'link', 'description' => 'Link to the invoice page, with Pay online'],
        ];
        $repaymentVars = [
            ['name' => 'amount', 'description' => 'Amount received in MVR'],
            ['name' => 'method', 'description' => 'cash, card, bank transfer, online by card, or from your wallet'],
            ['name' => 'balance', 'description' => 'Balance still owed in MVR'],
            ['name' => 'next_due_date', 'description' => 'The next invoice due date (blank when none)'],
            ['name' => 'next_due', 'description' => 'A whole sentence naming the next due date, or nothing'],
        ];
        $walletVars = [
            ['name' => 'amount', 'description' => 'Amount in MVR'],
            ['name' => 'method', 'description' => 'cash, card, bank transfer or online'],
            ['name' => 'balance', 'description' => 'Wallet balance after, in MVR'],
        ];

        SmsTemplateWording::ensure([
            'slug' => 'customer_credit_charged',
            'name' => 'Charged to credit account (customer)',
            'body' => 'Bake & Grill: MVR {{amount}} charged to your credit account for #{{order_number}}, due {{due_date}}. You owe MVR {{balance}}, MVR {{available}} available. View or pay: {{link}}',
            'description' => 'Sent when a till sale is charged to the customer\'s credit account, in place of the receipt text.',
            'variables' => $creditVars,
        ]);
        SmsTemplateWording::ensure([
            'slug' => 'customer_credit_repayment',
            'name' => 'Credit payment received (customer)',
            'body' => 'Bake & Grill: thank you, MVR {{amount}} received ({{method}}) on your credit account. You now owe MVR {{balance}}.{{next_due}}',
            'description' => 'Sent when a repayment is recorded at the till, in Admin, online or from the wallet and a balance remains.',
            'variables' => $repaymentVars,
        ]);
        SmsTemplateWording::ensure([
            'slug' => 'customer_credit_repayment_settled',
            'name' => 'Credit payment received, account fully paid (customer)',
            'body' => 'Bake & Grill: thank you, MVR {{amount}} received ({{method}}). Your credit account is fully paid.',
            'description' => 'Sent instead of the usual wording when the repayment clears the whole balance.',
            'variables' => $repaymentVars,
        ]);
        SmsTemplateWording::ensure([
            'slug' => 'customer_deposit_received',
            'name' => 'Wallet: money added (customer)',
            'body' => 'Bake & Grill: MVR {{amount}} added to your wallet ({{method}}). Wallet balance: MVR {{balance}}.',
            'description' => 'Sent when a deposit is received at the till or in Admin.',
            'variables' => $walletVars,
        ]);
        SmsTemplateWording::ensure([
            'slug' => 'customer_deposit_paid_out',
            'name' => 'Wallet: money paid out (customer)',
            'body' => 'Bake & Grill: MVR {{amount}} paid out from your wallet ({{method}}). Wallet balance: MVR {{balance}}.',
            'description' => 'Sent when wallet money is paid back to the customer.',
            'variables' => $walletVars,
        ]);
        SmsTemplateWording::ensure([
            'slug' => 'customer_deposit_on_hold',
            'name' => 'Wallet on hold (customer)',
            'body' => 'Bake & Grill: your wallet has been put on hold and cannot be used for now. Please contact us.',
            'description' => 'Sent when a wallet is frozen.',
            'variables' => [['name' => 'balance', 'description' => 'Wallet balance in MVR']],
        ]);
        SmsTemplateWording::ensure([
            'slug' => 'customer_deposit_active',
            'name' => 'Wallet active again (customer)',
            'body' => 'Bake & Grill: your wallet is active again. Balance: MVR {{balance}}.',
            'description' => 'Sent when a frozen wallet is made active again.',
            'variables' => [['name' => 'balance', 'description' => 'Wallet balance in MVR']],
        ]);

        // The reminders: Pay online, and the whole balance beside the one
        // invoice. Only a wording still as seeded is replaced.
        $reminderVars = [
            ['name' => 'invoice_number', 'description' => 'Invoice number'],
            ['name' => 'amount', 'description' => 'Amount still due on this invoice in MVR'],
            ['name' => 'balance', 'description' => 'Everything owed on the account in MVR'],
            ['name' => 'due_date', 'description' => 'The invoice due date'],
            ['name' => 'days_overdue', 'description' => 'Days past the due date'],
            ['name' => 'link', 'description' => 'Link to the invoice page, with Pay online'],
        ];
        SmsTemplateWording::replaceIfUnchanged('credit_reminder_upcoming', [
            'Bake & Grill: credit invoice {{invoice_number}} - MVR {{amount}} due on {{due_date}}. View: {{link}}',
            'Bake & Grill: Credit invoice {{invoice_number}} - MVR {{amount}} due on {{due_date}}. View: {{link}}',
        ], 'Bake & Grill: credit invoice {{invoice_number}} - MVR {{amount}} due on {{due_date}}. You owe MVR {{balance}} in all. Pay online: {{link}}', $reminderVars);
        SmsTemplateWording::replaceIfUnchanged('credit_reminder_due_today', [
            'Bake & Grill: credit payment due today - invoice {{invoice_number}}, MVR {{amount}}. View: {{link}}',
            'Bake & Grill: Credit payment due today - invoice {{invoice_number}}, MVR {{amount}}. View: {{link}}',
        ], 'Bake & Grill: credit payment due today - invoice {{invoice_number}}, MVR {{amount}}. You owe MVR {{balance}} in all. Pay online: {{link}}', $reminderVars);
        SmsTemplateWording::replaceIfUnchanged('credit_reminder_overdue', [
            'Bake & Grill: credit invoice {{invoice_number}} is {{days_overdue}} days overdue (MVR {{amount}}, due {{due_date}}). View: {{link}}',
            'Bake & Grill: Credit invoice {{invoice_number}} is {{days_overdue}} days overdue (MVR {{amount}}, due {{due_date}}). View: {{link}}',
        ], 'Bake & Grill: credit invoice {{invoice_number}} is {{days_overdue}} days overdue (MVR {{amount}}, due {{due_date}}). You owe MVR {{balance}} in all. Pay online: {{link}}', $reminderVars);

        // The receipt texts may carry the wallet balance; the wording keeps
        // its body, only the list of what it may use grows.
        $walletNote = ['name' => 'wallet_note', 'description' => 'When the sale was paid from the wallet: the amount and the balance left (blank otherwise; added at the end when the wording has no place for it)'];
        SmsTemplateWording::replaceIfUnchanged('customer_payment_confirmed_pos', [], '', [
            ['name' => 'order_number', 'description' => 'Order number'],
            ['name' => 'receipt_url', 'description' => 'Link to the receipt'],
            $walletNote,
        ]);
        SmsTemplateWording::replaceIfUnchanged('customer_payment_confirmed_online', [], '', [
            ['name' => 'payment_method_suffix', 'description' => '" via BML Pay" and the like, or nothing'],
            ['name' => 'order_number', 'description' => 'Order number'],
            ['name' => 'ready_hint', 'description' => 'When the next text comes'],
            ['name' => 'tracking_url', 'description' => 'Link to the order page'],
            $walletNote,
        ]);
    }

    public function down(): void
    {
        DB::table('sms_templates')->whereIn('slug', self::NEW_SLUGS)->delete();
    }
};
