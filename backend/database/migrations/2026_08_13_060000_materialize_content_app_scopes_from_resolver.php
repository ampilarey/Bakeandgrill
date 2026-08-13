<?php

declare(strict_types=1);

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Models\SiteSetting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Stage 2 — materialize ContentResolver output into website / order_app scopes.
 *
 * For each non-deprecated content key × app × locale, write the value the app
 * currently resolves (old four-step chain) into that app's own row — except when
 * the resolved value is the registry default (leave both app rows absent).
 *
 * Shared rows are never modified. Safe to re-run. Reversing is restoring the
 * old ContentResolver lookup chain (down() is intentionally a no-op).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('site_settings')) {
            return;
        }
        if (! Schema::hasColumn('site_settings', 'scope') || ! Schema::hasColumn('site_settings', 'locale')) {
            return;
        }

        $now = now();

        foreach (ContentRegistry::hubBlocks() as $key => $block) {
            $key = (string) $key;
            foreach (ContentRegistry::APPS as $app) {
                if (! ContentRegistry::targetsApp($key, $app)) {
                    continue;
                }
                foreach (ContentRegistry::LOCALES as $locale) {
                    $resolved = ContentResolver::for($app, $locale)->get($key);

                    // Present = not null and not ''. "[]" is present and wins.
                    if ($resolved === null || $resolved === '') {
                        continue;
                    }

                    $default = ContentRegistry::default($key);
                    if ($this->normalize($resolved) === $this->normalize($default)) {
                        // Keep resolving via registry default — do not materialise.
                        continue;
                    }

                    $this->upsertAppScopedRow(
                        key: $key,
                        app: $app,
                        locale: $locale,
                        value: $this->toStoredString($resolved),
                        block: is_array($block) ? $block : [],
                        now: $now,
                    );
                }
            }
        }

        // getScoped / allPublic use rememberForever — flush after mass writes.
        SiteSetting::bust();
        ContentResolver::bust();
    }

    public function down(): void
    {
        // No-op: shared was never touched. App-scoped copies are harmless under
        // the old resolver chain. Roll back Stage 2 by restoring the four-step
        // ContentResolver lookup, not by deleting data.
    }

    /**
     * @param  array<string, mixed>  $block
     */
    private function upsertAppScopedRow(
        string $key,
        string $app,
        string $locale,
        string $value,
        array $block,
        mixed $now,
    ): void {
        $existing = DB::table('site_settings')
            ->where('key', $key)
            ->where('scope', $app)
            ->where('locale', $locale)
            ->first();

        if ($existing) {
            DB::table('site_settings')
                ->where('id', $existing->id)
                ->update([
                    'value' => $value,
                    'updated_at' => $now,
                ]);
            SiteSetting::forgetScoped($key, $app, $locale);

            return;
        }

        $template = DB::table('site_settings')
            ->where('key', $key)
            ->where('scope', 'shared')
            ->where('locale', 'en')
            ->first()
            ?? DB::table('site_settings')->where('key', $key)->first();

        DB::table('site_settings')->insert([
            'key' => $key,
            'scope' => $app,
            'locale' => $locale,
            'value' => $value,
            'type' => $template->type ?? ($block['type'] ?? 'text'),
            'group' => $template->group ?? ($block['group'] ?? 'Content'),
            'label' => $template->label ?? ($block['label'] ?? $key),
            'description' => $template->description ?? ($block['description'] ?? ''),
            'is_public' => (bool) ($template->is_public ?? ($block['public'] ?? false)),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        SiteSetting::forgetScoped($key, $app, $locale);
    }

    private function toStoredString(mixed $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_array($value) || is_object($value)) {
            return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
        }

        return (string) $value;
    }

    private function normalize(mixed $value): mixed
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        if (is_array($value) || is_object($value)) {
            return json_decode(
                json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: 'null',
                true,
            );
        }

        return $value;
    }
};
