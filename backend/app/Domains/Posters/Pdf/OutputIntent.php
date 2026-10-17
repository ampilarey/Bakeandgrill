<?php

declare(strict_types=1);

namespace App\Domains\Posters\Pdf;

/**
 * The printing condition a poster PDF is made for (docs/POSTER_PLAN.md
 * § 6.1, § 14): what the shop's software reads to know what the colours
 * mean. The ICC profile is optional on disk (it is not in the repository;
 * scripts/install-poster-icc.sh fetches it); without it the intent is named
 * by registry only and PDF/X-4 strict preflight will say so.
 */
final class OutputIntent
{
    public function __construct(
        public readonly string $condition,
        public readonly string $identifier,
        public readonly string $registry,
        public readonly string $info,
        public readonly int $components,
        public readonly ?string $profilePath,
    ) {}

    public static function fromConfig(): self
    {
        $c = (array) config('posters.output_intent', []);

        return new self(
            (string) ($c['condition'] ?? 'FOGRA39 (ISO 12647-2:2004)'),
            (string) ($c['identifier'] ?? 'FOGRA39'),
            (string) ($c['registry'] ?? 'http://www.color.org'),
            (string) ($c['info'] ?? 'Coated FOGRA39 (ISO 12647-2:2004)'),
            (int) ($c['components'] ?? 4),
            isset($c['profile']) && $c['profile'] !== '' ? (string) $c['profile'] : null,
        );
    }

    public function hasProfile(): bool
    {
        return $this->profilePath !== null && is_file($this->profilePath) && filesize($this->profilePath) > 128;
    }

    public function profileBytes(): ?string
    {
        if (!$this->hasProfile()) {
            return null;
        }
        $bytes = file_get_contents((string) $this->profilePath);

        return $bytes === false ? null : $bytes;
    }
}
