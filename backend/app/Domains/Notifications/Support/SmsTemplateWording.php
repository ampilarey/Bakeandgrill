<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use Illuminate\Support\Facades\DB;

/**
 * Template seeding helpers for migrations: add a wording that is missing,
 * and change a built-in wording only while it still reads as it was seeded,
 * so a wording the owner edited in Admin → Notifications is never written
 * over (credit and wallet texts, 2026-10-21).
 */
final class SmsTemplateWording
{
    /**
     * Insert the template unless a row with its slug exists.
     *
     * @param array{slug: string, name: string, body: string, description?: string, variables?: list<array{name: string, description: string}>, type?: string} $template
     */
    public static function ensure(array $template): bool
    {
        if (DB::table('sms_templates')->where('slug', $template['slug'])->exists()) {
            return false;
        }
        $now = now();
        DB::table('sms_templates')->insert([
            'slug' => $template['slug'],
            'name' => $template['name'],
            'type' => $template['type'] ?? 'order_notification',
            'body' => $template['body'],
            'description' => $template['description'] ?? null,
            'variables' => json_encode($template['variables'] ?? [], JSON_UNESCAPED_UNICODE),
            'is_system' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return true;
    }

    /**
     * Replace the body only when it is still one of the wordings we seeded;
     * an owner's own wording stays. The variables list is refreshed either
     * way, since it only describes what the wording may use.
     *
     * @param list<string> $seeded the bodies this slug was seeded with before
     * @param list<array{name: string, description: string}>|null $variables
     */
    public static function replaceIfUnchanged(string $slug, array $seeded, string $new, ?array $variables = null): bool
    {
        $row = DB::table('sms_templates')->where('slug', $slug)->first(['id', 'body']);
        if ($row === null) {
            return false;
        }
        $updates = ['updated_at' => now()];
        if ($variables !== null) {
            $updates['variables'] = json_encode($variables, JSON_UNESCAPED_UNICODE);
        }
        $unchanged = in_array(trim((string) $row->body), array_map('trim', $seeded), true);
        if ($unchanged) {
            $updates['body'] = $new;
        }
        DB::table('sms_templates')->where('id', $row->id)->update($updates);

        return $unchanged;
    }
}
