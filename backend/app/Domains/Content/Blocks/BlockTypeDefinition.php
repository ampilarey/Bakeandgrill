<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

/**
 * Code-owned description of a home-page block type.
 * Instances live in page_blocks; types live here.
 */
final class BlockTypeDefinition
{
    /**
     * @param  list<string>  $apps
     * @param  array<string, string>  $settingsSchema  Laravel validation rules keyed by settings field
     */
    public function __construct(
        public readonly string $type,
        public readonly string $label,
        public readonly string $description,
        public readonly array $apps,
        public readonly bool $removable,
        public readonly bool $supportsSharedContent,
        public readonly array $settingsSchema = [],
        public readonly ?string $nonRemovableReason = null,
    ) {}

    public function allowsApp(string $app): bool
    {
        return in_array($app, $this->apps, true);
    }
}
