<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\SiteSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * What /privacy, /terms and /refund have in common.
 *
 * All three read `content('legal_last_updated_date', 'April 2026')`, which
 * looks like it falls back and never does: the key is registered with a ''
 * default, and ContentResolver returns any non-null registry default ahead of
 * the caller's. Verified against the live site on 2026-08-22 — /terms and
 * /refund both rendered a bare "Last updated:" with nothing after it.
 *
 * The fix is per-view rather than in the resolver. Plenty of keys default to
 * '' meaning "render nothing", so making an empty registry default fall
 * through to the caller's would change behaviour on every surface that reads
 * one — a large blast radius for a dangling label on three pages.
 */
class LegalPagesTest extends TestCase
{
    use RefreshDatabase;

    /** @return list<array{0: string}> */
    public static function legalPages(): array
    {
        return [['/privacy'], ['/terms'], ['/refund']];
    }

    #[DataProvider('legalPages')]
    public function test_it_never_shows_a_dangling_last_updated_label(string $path): void
    {
        $html = $this->get($path)->assertOk()->getContent();

        // The label must not appear with nothing after it. Printing today's
        // date would claim the policy changed today, every day; hiding the
        // line is the honest answer until the owner sets one in Content Hub.
        $this->assertDoesNotMatchRegularExpression('#Last updated:\s*(&nbsp;)?\s*<#', $html);
    }

    #[DataProvider('legalPages')]
    public function test_it_shows_the_date_once_the_owner_sets_one(string $path): void
    {
        SiteSetting::set('legal_last_updated_date', 'August 2026', 'website', 'en');

        $this->get($path)
            ->assertOk()
            ->assertSee('August 2026', false);
    }
}
