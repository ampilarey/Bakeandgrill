<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Does anything on record point at this staff account? (staff audit,
 * 2026-10-01)
 *
 * "Remove" used to delete the row outright. Through the foreign keys that
 * took the person's cash-drawer movements, time-clock hours, rota, stock
 * counts, purchase requests and kitchen production records with it, and it
 * failed with a server error if they had ever logged an expense. An account
 * with history is now archived instead; only one nobody ever used is deleted.
 *
 * Read from the schema rather than from a list, so a table added later that
 * points at users is covered without anybody remembering to add it here.
 */
final class StaffHistory
{
    /**
     * Rows that belong to the person rather than to the business: their own
     * settings and drafts. These go with the account.
     */
    private const PERSONAL = [
        'user_permission', 'staff_notification_prefs', 'pos_quick_layouts', 'pos_quick_keys',
        'content_drafts', 'page_layout_drafts', 'sessions', 'personal_access_tokens',
    ];

    public function hasHistory(User $user): bool
    {
        foreach ($this->references() as [$table, $column]) {
            if (DB::table($table)->where($column, $user->id)->exists()) {
                return true;
            }
        }

        return Schema::hasTable('audit_logs')
            && DB::table('audit_logs')->where('user_id', $user->id)->exists();
    }

    /** @return list<array{0: string, 1: string}> every (table, column) pointing at users.id */
    private function references(): array
    {
        $refs = [];
        foreach (Schema::getTables() as $table) {
            $name = (string) $table['name'];
            if (in_array($name, self::PERSONAL, true) || $name === 'users') {
                continue;
            }
            foreach (Schema::getForeignKeys($name) as $fk) {
                if (($fk['foreign_table'] ?? null) === 'users' && count($fk['columns'] ?? []) === 1) {
                    $refs[] = [$name, (string) $fk['columns'][0]];
                }
            }
        }

        return $refs;
    }
}
