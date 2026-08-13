<?php

declare(strict_types=1);

namespace Tests\Unit\Content;

use App\Domains\Content\Blocks\BlockTypeRegistry;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every registered library type must be deliberately singleton or multi-instance.
 * New types default to singleton (allowsMultiple=false) — adding a multi-instance
 * type requires an explicit allowsMultiple: true and an entry in this allow-list.
 */
class BlockTypeSingletonClassificationTest extends TestCase
{
    /** @var list<string> */
    public const MULTI_INSTANCE_TYPES = [
        'rich_text',
        'image',
        'image_text',
        'video',
        'button_band',
        'faq_list',
        'divider',
    ];

    public function test_every_library_type_is_deliberately_singleton_or_multi_instance(): void
    {
        $types = BlockTypeRegistry::libraryTypes();
        $this->assertNotEmpty($types);

        foreach ($types as $type) {
            $multi = in_array($type, self::MULTI_INSTANCE_TYPES, true);
            $this->assertSame(
                $multi,
                BlockTypeRegistry::allowsMultiple($type),
                $multi
                    ? "{$type} must remain multi-instance (listed in MULTI_INSTANCE_TYPES)"
                    : "{$type} must be singleton — omit from MULTI_INSTANCE_TYPES or set allowsMultiple:true deliberately",
            );
        }

        foreach (self::MULTI_INSTANCE_TYPES as $type) {
            $this->assertContains(
                $type,
                $types,
                "MULTI_INSTANCE_TYPES entry [{$type}] is not a registered library type",
            );
        }
    }

    #[DataProvider('singletonStoreExamples')]
    public function test_singleton_examples_are_not_multi(string $type): void
    {
        $this->assertFalse(BlockTypeRegistry::allowsMultiple($type));
    }

    /** @return array<string, array{0: string}> */
    public static function singletonStoreExamples(): array
    {
        return [
            'prayer_bar' => ['prayer_bar'],
            'announcement' => ['announcement'],
            'bottom_nav' => ['bottom_nav'],
            'site_footer' => ['site_footer'],
            'opening_status' => ['opening_status'],
            'hero' => ['hero'],
        ];
    }
}
