<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use App\Models\Poster;

/**
 * What a printed poster was bound to, and how that differs from the menu
 * now (docs/POSTER_PLAN.md § 10). The diff is also the out-of-date alert.
 */
final class PosterStaleness
{
    /** @return array<string, string> */
    public static function snapshot(Poster $poster): array
    {
        $content = PosterContent::resolve($poster->toArray());
        $rows = [];
        foreach (is_array($content['rows'] ?? null) ? $content['rows'] : [] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $rows[] = trim((string) ($row['name'] ?? '')) . ' ' . trim((string) ($row['price'] ?? ''));
        }
        $hours = [];
        foreach (is_array($content['hours'] ?? null) ? $content['hours'] : [] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $hours[] = trim((string) ($row['day'] ?? '')) . ' ' . trim((string) ($row['time'] ?? $row['hours'] ?? $row['text'] ?? ''));
        }

        return [
            'headline' => (string) ($content['headline'] ?? ''),
            'price' => (string) ($content['price'] ?? ''),
            'rows' => implode("\n", $rows),
            'hours' => implode("\n", $hours),
        ];
    }

    /** @param array<string, string> $snapshot */
    public static function hash(array $snapshot): string
    {
        return hash('sha256', json_encode($snapshot, JSON_UNESCAPED_UNICODE) ?: '');
    }

    /**
     * @param array<string, mixed>|null $before
     * @param array<string, string> $after
     */
    public static function diff(?array $before, array $after): string
    {
        if ($before === null || $before === []) {
            return '';
        }
        $lines = [];
        foreach (['price' => 'price', 'headline' => 'headline', 'rows' => 'menu', 'hours' => 'hours'] as $key => $label) {
            $from = trim((string) ($before[$key] ?? ''));
            $to = trim((string) ($after[$key] ?? ''));
            if ($from !== $to) {
                $lines[] = $label . ' ' . ($from !== '' ? $from : '—') . ' → ' . ($to !== '' ? $to : '—');
            }
        }

        return implode('; ', $lines);
    }
}
