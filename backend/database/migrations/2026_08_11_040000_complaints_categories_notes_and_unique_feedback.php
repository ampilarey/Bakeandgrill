<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Multi-select categories, split internal note vs customer reply,
 * and one feedback rating per receipt.
 */
return new class extends Migration
{
    public function up(): void
    {
        // --- Complaints: categories list (replaces singular category) ---
        if (Schema::hasTable('complaints') && Schema::hasColumn('complaints', 'category') && ! Schema::hasColumn('complaints', 'categories')) {
            Schema::table('complaints', function (Blueprint $table) {
                $table->json('categories')->nullable()->after('status');
            });

            $migratedCategories = 0;
            DB::table('complaints')->orderBy('id')->chunkById(200, function ($rows) use (&$migratedCategories) {
                foreach ($rows as $row) {
                    $cat = $row->category ?? null;
                    DB::table('complaints')->where('id', $row->id)->update([
                        'categories' => json_encode($cat ? [$cat] : []),
                    ]);
                    $migratedCategories++;
                }
            });
            echo "Migrated {$migratedCategories} complaint row(s) category → categories (one-element lists).\n";

            try {
                Schema::table('complaints', function (Blueprint $table) {
                    $table->dropIndex(['category']);
                });
            } catch (\Throwable) {
                // Index may already be gone or named differently.
            }

            Schema::table('complaints', function (Blueprint $table) {
                $table->dropColumn('category');
            });
        }

        // --- Complaints: split resolution_note → internal_note + customer_reply ---
        if (Schema::hasTable('complaints') && Schema::hasColumn('complaints', 'resolution_note') && ! Schema::hasColumn('complaints', 'customer_reply')) {
            Schema::table('complaints', function (Blueprint $table) {
                $table->text('internal_note')->nullable()->after('refund_id');
                $table->text('customer_reply')->nullable()->after('internal_note');
            });

            $movedNotes = 0;
            DB::table('complaints')->whereNotNull('resolution_note')->orderBy('id')->chunkById(200, function ($rows) use (&$movedNotes) {
                foreach ($rows as $row) {
                    DB::table('complaints')->where('id', $row->id)->update([
                        'internal_note' => $row->resolution_note,
                        'customer_reply' => null,
                    ]);
                    $movedNotes++;
                }
            });
            echo "Moved {$movedNotes} complaint resolution_note row(s) → internal_note (not customer_reply).\n";

            Schema::table('complaints', function (Blueprint $table) {
                $table->dropColumn('resolution_note');
            });
        } elseif (Schema::hasTable('complaints') && ! Schema::hasColumn('complaints', 'internal_note')) {
            Schema::table('complaints', function (Blueprint $table) {
                $table->text('internal_note')->nullable();
                $table->text('customer_reply')->nullable();
            });
        }

        // --- Status history: customer_reply + fold resolution_note into internal_note ---
        if (Schema::hasTable('complaint_status_histories')) {
            if (! Schema::hasColumn('complaint_status_histories', 'customer_reply')) {
                Schema::table('complaint_status_histories', function (Blueprint $table) {
                    $table->text('customer_reply')->nullable()->after('internal_note');
                });
            }

            if (Schema::hasColumn('complaint_status_histories', 'resolution_note')) {
                $histMoved = 0;
                DB::table('complaint_status_histories')->whereNotNull('resolution_note')->orderBy('id')->chunkById(200, function ($rows) use (&$histMoved) {
                    foreach ($rows as $row) {
                        $parts = array_filter([
                            $row->internal_note ?? null,
                            $row->resolution_note ?? null,
                        ], fn ($v) => is_string($v) && trim($v) !== '');
                        DB::table('complaint_status_histories')->where('id', $row->id)->update([
                            'internal_note' => $parts === [] ? null : implode("\n\n", $parts),
                        ]);
                        $histMoved++;
                    }
                });
                echo "Folded {$histMoved} complaint_status_histories resolution_note row(s) into internal_note.\n";

                Schema::table('complaint_status_histories', function (Blueprint $table) {
                    $table->dropColumn('resolution_note');
                });
            }
        }

        // --- Receipt feedback: one row per receipt ---
        if (Schema::hasTable('receipt_feedback')) {
            $duplicatesRemoved = 0;
            $dupReceiptIds = DB::table('receipt_feedback')
                ->select('receipt_id')
                ->groupBy('receipt_id')
                ->havingRaw('COUNT(*) > 1')
                ->pluck('receipt_id');

            foreach ($dupReceiptIds as $receiptId) {
                $keepId = DB::table('receipt_feedback')
                    ->where('receipt_id', $receiptId)
                    ->orderByDesc('id')
                    ->value('id');
                $deleted = DB::table('receipt_feedback')
                    ->where('receipt_id', $receiptId)
                    ->where('id', '!=', $keepId)
                    ->delete();
                $duplicatesRemoved += $deleted;
            }
            echo "Removed {$duplicatesRemoved} duplicate receipt_feedback row(s) (kept most recent per receipt).\n";

            try {
                Schema::table('receipt_feedback', function (Blueprint $table) {
                    $table->dropIndex(['receipt_id']);
                });
            } catch (\Throwable) {
                // Index name may differ across drivers; unique below still applies.
            }

            try {
                Schema::table('receipt_feedback', function (Blueprint $table) {
                    $table->unique('receipt_id', 'receipt_feedback_receipt_id_unique');
                });
            } catch (\Throwable) {
                // Already unique (re-run / partial apply).
            }
        }

        if (Schema::hasTable('sms_templates')) {
            DB::table('sms_templates')->where('slug', 'customer_complaint_resolved')->update([
                'body' => 'Bake & Grill ({{reference}}): {{customer_reply}}',
                'description' => 'Sent when a complaint is marked resolved — uses the owner customer reply.',
                'variables' => json_encode([
                    ['name' => 'reference', 'description' => 'Complaint reference'],
                    ['name' => 'customer_reply', 'description' => 'Owner reply shown to the customer'],
                ]),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('receipt_feedback')) {
            try {
                Schema::table('receipt_feedback', function (Blueprint $table) {
                    $table->dropUnique('receipt_feedback_receipt_id_unique');
                });
            } catch (\Throwable) {
            }
            Schema::table('receipt_feedback', function (Blueprint $table) {
                $table->index('receipt_id');
            });
        }

        if (Schema::hasTable('complaint_status_histories')) {
            if (! Schema::hasColumn('complaint_status_histories', 'resolution_note')) {
                Schema::table('complaint_status_histories', function (Blueprint $table) {
                    $table->text('resolution_note')->nullable();
                });
            }
            if (Schema::hasColumn('complaint_status_histories', 'customer_reply')) {
                Schema::table('complaint_status_histories', function (Blueprint $table) {
                    $table->dropColumn('customer_reply');
                });
            }
        }

        if (Schema::hasTable('complaints')) {
            if (! Schema::hasColumn('complaints', 'category')) {
                Schema::table('complaints', function (Blueprint $table) {
                    $table->string('category', 40)->nullable();
                });
                DB::table('complaints')->orderBy('id')->chunkById(200, function ($rows) {
                    foreach ($rows as $row) {
                        $cats = json_decode($row->categories ?? '[]', true) ?: [];
                        DB::table('complaints')->where('id', $row->id)->update([
                            'category' => $cats[0] ?? 'other',
                        ]);
                    }
                });
            }
            if (Schema::hasColumn('complaints', 'categories')) {
                Schema::table('complaints', function (Blueprint $table) {
                    $table->dropColumn('categories');
                });
            }
            if (! Schema::hasColumn('complaints', 'resolution_note')) {
                Schema::table('complaints', function (Blueprint $table) {
                    $table->text('resolution_note')->nullable();
                });
                DB::table('complaints')->whereNotNull('internal_note')->update([
                    'resolution_note' => DB::raw('internal_note'),
                ]);
            }
            foreach (['internal_note', 'customer_reply'] as $col) {
                if (Schema::hasColumn('complaints', $col)) {
                    Schema::table('complaints', function (Blueprint $table) use ($col) {
                        $table->dropColumn($col);
                    });
                }
            }
        }
    }
};
