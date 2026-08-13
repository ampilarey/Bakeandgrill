<?php

declare(strict_types=1);

namespace App\Support\Schema;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/**
 * Ensures receipt_feedback.receipt_id has a unique constraint (one rating per receipt).
 */
final class ReceiptFeedbackUnique
{
    public const INDEX_NAME = 'receipt_feedback_receipt_id_unique';

    public static function hasUniqueOnReceiptId(): bool
    {
        if (! Schema::hasTable('receipt_feedback')) {
            return false;
        }

        foreach (Schema::getIndexes('receipt_feedback') as $index) {
            $columns = $index['columns'] ?? [];
            $unique = (bool) ($index['unique'] ?? false);
            if ($unique && $columns === ['receipt_id']) {
                return true;
            }
        }

        return false;
    }

    /**
     * Add the unique constraint if missing. Succeeds only when the constraint is verified present.
     * "Already exists" is acceptable only after confirmation the desired unique is in place.
     */
    public static function ensure(): void
    {
        if (! Schema::hasTable('receipt_feedback')) {
            return;
        }

        if (self::hasUniqueOnReceiptId()) {
            return;
        }

        try {
            Schema::table('receipt_feedback', function (Blueprint $table) {
                $table->unique('receipt_id', self::INDEX_NAME);
            });
        } catch (\Throwable $e) {
            // PostgreSQL aborts the ambient transaction after a failed ADD CONSTRAINT.
            // Avoid further schema introspection on a dead TX — wrap and rethrow.
            try {
                if (self::hasUniqueOnReceiptId()) {
                    // Constraint already existed under another name / race — confirmed present.
                    return;
                }
            } catch (\Throwable) {
                // Schema queries may fail after TX abort; treat as not unique.
            }

            throw new RuntimeException(
                'Failed to add unique constraint on receipt_feedback.receipt_id ('.self::INDEX_NAME.'). '
                .'One rating per receipt is not enforced. Dedupe duplicates, then re-run migrate. '
                .'Underlying error: '.$e->getMessage(),
                0,
                $e,
            );
        }

        if (! self::hasUniqueOnReceiptId()) {
            throw new RuntimeException(
                'Unique constraint on receipt_feedback.receipt_id was not present after migrate attempted to add it. '
                .'One rating per receipt is not enforced. Inspect indexes on receipt_feedback and re-run migrate.',
            );
        }
    }
}
