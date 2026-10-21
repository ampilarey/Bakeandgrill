<?php

declare(strict_types=1);

namespace App\Domains\Posters;

use RuntimeException;

/**
 * The piece list of a poster drawn on a ready-made design
 * (docs/POSTER_THEMES_HANDOFF.md). Filled in by the PDF phase; until then a
 * template poster cannot be drawn, and says so rather than falling back to
 * a layout.
 */
final class PosterThemePieces
{
    /**
     * @param array<string, mixed> $poster
     * @param array<string, mixed> $content
     * @return array<string, mixed>
     */
    public static function build(array $poster, PaperSize $size, array $content): array
    {
        $key = (string) ($poster['theme'] ?? '');
        if ($key === '' || PosterThemes::get($key) === null) {
            throw new RuntimeException('A template poster needs a template.');
        }
        throw new RuntimeException('Template posters are not drawn yet.');
    }
}
