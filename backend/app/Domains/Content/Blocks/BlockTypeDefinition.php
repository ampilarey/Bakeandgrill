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
     * @param  array<string, mixed>  $settingsDefaults  Filled in for absent keys before the schema runs
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
        public readonly array $settingsDefaults = [],
        public readonly bool $allowsMultiple = false,
        /** Deprecated types stay readable/migratable but are not offered as new adds. */
        public readonly bool $deprecated = false,
        /** Soft warning when turning off / removing a flow-critical section. */
        public readonly ?string $flowWarning = null,
        /** Dynamic data service powering this block (loyalty, prayer, menu, …). */
        public readonly ?string $dynamicSource = null,
    ) {}

    public function allowsApp(string $app): bool
    {
        return in_array($app, $this->apps, true);
    }
}
