<?php

declare(strict_types=1);

use App\Domains\Notifications\Support\SmsTemplateWording;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Money into the wallet by card (owner, 2026-10-21: "when customer log in,
 * option to pay deposit to his acc"). A top-up is its own record, never an
 * order: the card payment points at it (payments.wallet_topup_id) the way an
 * invoice payment points at its invoice, and the settle writes one top_up
 * ledger row. A staff member can also send the customer a link to one.
 */
return new class extends Migration
{
    private const XOR_NAME = 'payments_order_xor_invoice_chk';

    public function up(): void
    {
        Schema::create('wallet_topups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            // Null until the customer picks an amount on an open link.
            $table->unsignedInteger('amount_laar')->nullable();
            // True when the amount was set by whoever made it (the app, or
            // staff on a link); an open link's customer may change theirs.
            $table->boolean('amount_fixed')->default(false);
            // pending, paid, expired, cancelled
            $table->string('status', 16)->default('pending');
            // app: started in the order app; link: a staff member sent the link.
            $table->string('source', 8)->default('app');
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('payment_id')->nullable()->constrained('payments')->nullOnDelete();
            $table->foreignId('ledger_id')->nullable()->constrained('customer_deposit_ledger')->nullOnDelete();
            $table->string('note', 200)->nullable();
            $table->timestamp('link_sent_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->index(['customer_id', 'status']);
            $table->index(['status', 'expires_at']);
        });

        if (!Schema::hasColumn('payments', 'wallet_topup_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->foreignId('wallet_topup_id')->nullable()->after('invoice_id')
                    ->constrained('wallet_topups')->nullOnDelete();
            });
        }

        // Stage D's CHECK (an order or an invoice, never neither) must let a
        // top-up payment through. MariaDB refused it on FK columns in the
        // first place; where it took, it is widened to three.
        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            if ($this->xorExists()) {
                DB::statement('ALTER TABLE payments DROP CONSTRAINT ' . self::XOR_NAME);
            }
            try {
                DB::statement('ALTER TABLE payments ADD CONSTRAINT ' . self::XOR_NAME . ' CHECK (
                    (`order_id` IS NOT NULL AND `invoice_id` IS NULL AND `wallet_topup_id` IS NULL)
                    OR (`order_id` IS NULL AND `invoice_id` IS NOT NULL AND `wallet_topup_id` IS NULL)
                    OR (`order_id` IS NULL AND `invoice_id` IS NULL AND `wallet_topup_id` IS NOT NULL)
                )');
            } catch (Throwable $e) {
                // MariaDB error 1901: a CHECK may not name FK columns. The
                // services enforce the rule, as stage D already relied on.
                if (!str_contains($e->getMessage(), '1901') && !str_contains($e->getMessage(), 'cannot be used in the CHECK clause')) {
                    throw $e;
                }
            }
        }

        // The link text staff send, and the receipt link on the "money added" text.
        SmsTemplateWording::ensure([
            'slug' => 'customer_wallet_topup_link',
            'name' => 'Wallet: top-up link (customer)',
            'body' => 'Bake & Grill: add {{what}} to your wallet by card here: {{link}} The link is good for 7 days.',
            'description' => 'Sent when staff send a customer a link to add money to their wallet by card.',
            'variables' => [
                ['name' => 'what', 'description' => '"MVR 500.00" when the link carries an amount, else "money"'],
                ['name' => 'amount', 'description' => 'The amount in MVR, blank on an open link'],
                ['name' => 'link', 'description' => 'The top-up page'],
                ['name' => 'name', 'description' => 'Customer name'],
            ],
        ]);
        SmsTemplateWording::replaceIfUnchanged('customer_deposit_received', [], '', [
            ['name' => 'amount', 'description' => 'Amount in MVR'],
            ['name' => 'method', 'description' => 'cash, card, bank transfer, online by card or gift card'],
            ['name' => 'balance', 'description' => 'Wallet balance after, in MVR'],
            ['name' => 'receipt', 'description' => 'When paid by card from the app or a link: " Receipt: <link>" (blank otherwise; added at the end when the wording has no place for it)'],
        ]);
    }

    public function down(): void
    {
        DB::table('sms_templates')->where('slug', 'customer_wallet_topup_link')->delete();

        $driver = Schema::getConnection()->getDriverName();
        if (in_array($driver, ['mysql', 'mariadb'], true) && $this->xorExists()) {
            DB::statement('ALTER TABLE payments DROP CONSTRAINT ' . self::XOR_NAME);
        }
        if (Schema::hasColumn('payments', 'wallet_topup_id')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->dropForeign(['wallet_topup_id']);
                $table->dropColumn('wallet_topup_id');
            });
        }
        Schema::dropIfExists('wallet_topups');
    }

    private function xorExists(): bool
    {
        $row = DB::selectOne(
            'SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ?',
            ['payments', self::XOR_NAME, 'CHECK'],
        );

        return $row !== null;
    }
};
