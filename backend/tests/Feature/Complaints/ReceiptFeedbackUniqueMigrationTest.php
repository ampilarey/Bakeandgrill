<?php

declare(strict_types=1);

namespace Tests\Feature\Complaints;

use App\Models\Receipt;
use App\Support\Schema\ReceiptFeedbackUnique;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class ReceiptFeedbackUniqueMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_unique_constraint_present_after_migrations(): void
    {
        $this->assertTrue(
            ReceiptFeedbackUnique::hasUniqueOnReceiptId(),
            'receipt_feedback.receipt_id must be unique after migrate',
        );
    }

    public function test_ensure_succeeds_when_already_unique(): void
    {
        $this->assertTrue(ReceiptFeedbackUnique::hasUniqueOnReceiptId());
        ReceiptFeedbackUnique::ensure(); // idempotent re-run
        $this->assertTrue(ReceiptFeedbackUnique::hasUniqueOnReceiptId());
    }

    public function test_ensure_fails_loudly_when_constraint_cannot_be_created(): void
    {
        $this->dropUniqueIfPresent();

        $receipt = $this->paidReceipt();
        DB::table('receipt_feedback')->insert([
            [
                'receipt_id' => $receipt->id,
                'rating' => 2,
                'comments' => 'old',
                'submitted_at' => now()->subHour(),
                'created_at' => now()->subHour(),
                'updated_at' => now()->subHour(),
            ],
            [
                'receipt_id' => $receipt->id,
                'rating' => 5,
                'comments' => 'new',
                'submitted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        try {
            ReceiptFeedbackUnique::ensure();
            $this->fail('Expected RuntimeException when unique cannot be created over duplicates');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('Failed to add unique constraint', $e->getMessage());
            $this->assertStringContainsString('One rating per receipt is not enforced', $e->getMessage());
        }

        // PostgreSQL aborts the RefreshDatabase transaction after a failed ADD CONSTRAINT;
        // further schema/DML on this connection will fail with 25P02 — message asserts above are enough.
        if (Schema::getConnection()->getDriverName() === 'pgsql') {
            return;
        }

        $this->assertFalse(
            ReceiptFeedbackUnique::hasUniqueOnReceiptId(),
            'Unique must not exist after a failed ensure (duplicates still present)',
        );

        // Clean up so tear-down / later tests are not polluted.
        $keepId = DB::table('receipt_feedback')->where('receipt_id', $receipt->id)->orderByDesc('id')->value('id');
        DB::table('receipt_feedback')->where('receipt_id', $receipt->id)->where('id', '!=', $keepId)->delete();
        ReceiptFeedbackUnique::ensure();
        $this->assertTrue(ReceiptFeedbackUnique::hasUniqueOnReceiptId());
    }

    private function dropUniqueIfPresent(): void
    {
        if (! ReceiptFeedbackUnique::hasUniqueOnReceiptId()) {
            return;
        }

        try {
            Schema::table('receipt_feedback', function ($table) {
                $table->dropUnique(ReceiptFeedbackUnique::INDEX_NAME);
            });
        } catch (\Throwable) {
            Schema::table('receipt_feedback', function ($table) {
                $table->dropUnique(['receipt_id']);
            });
        }

        $this->assertFalse(ReceiptFeedbackUnique::hasUniqueOnReceiptId());
    }

    private function paidReceipt(): Receipt
    {
        $customer = $this->makeCustomer([
            'phone' => '+9607'.str_pad((string) random_int(100000, 999999), 6, '0'),
        ]);
        $order = $this->makePaidOrder($customer, [
            'order_number' => 'BG-UQ-'.Str::upper(Str::random(4)),
            'total' => 20,
        ]);

        return Receipt::create([
            'order_id' => $order->id,
            'token' => Str::random(48),
            'channel' => 'sms',
            'recipient' => $customer->phone,
        ]);
    }
}
