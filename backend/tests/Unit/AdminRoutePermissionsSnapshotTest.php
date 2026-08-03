<?php

declare(strict_types=1);

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Guards against accidental loosening/tightening of route middleware permissions.
 * Admin UI drift fixes must change nav/App guards only — not these route strings.
 */
class AdminRoutePermissionsSnapshotTest extends TestCase
{
    #[Test]
    public function route_permission_middleware_matches_committed_fixture(): void
    {
        $routesRoot = base_path('routes');
        $entries = [];

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($routesRoot, \FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if (!$file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            $relative = 'backend/routes/'.ltrim(str_replace(base_path('routes'), '', $file->getPathname()), DIRECTORY_SEPARATOR);
            $relative = str_replace('\\', '/', $relative);
            $lines = file($file->getPathname(), FILE_IGNORE_NEW_LINES);
            foreach ($lines as $i => $line) {
                if (!preg_match_all('/permission:([a-zA-Z0-9_.\/|-]+)/', $line, $matches)) {
                    continue;
                }
                foreach ($matches[1] as $raw) {
                    foreach (explode('|', $raw) as $slug) {
                        $entries[] = sprintf('%s:%d:%s', $relative, $i + 1, $slug);
                    }
                }
            }
        }

        sort($entries);
        $actual = implode("\n", $entries)."\n";
        $fixturePath = base_path('tests/Fixtures/admin_route_permissions.txt');
        $this->assertFileExists($fixturePath);
        $expected = file_get_contents($fixturePath);
        $this->assertSame(
            $expected,
            $actual,
            'Backend route permission middleware changed. Admin UI drift fixes must not alter API permissions — update the fixture only when an intentional security change is approved.'
        );
    }

    #[Test]
    public function drifted_nav_only_slugs_are_not_route_middleware(): void
    {
        $fixture = file_get_contents(base_path('tests/Fixtures/admin_route_permissions.txt'));
        $this->assertNotFalse($fixture);

        $navOnly = [
            'dashboard.view',
            'menu.view',
            'reports.basic',
            'delivery.view',
            'orders.create',
            'reservations.view',
            'finance.cash_manage',
            'payments.cash_manage',
            'settings.manage',
            'finance.profit_loss',
            'pos.active_orders',
            'sms_marketing.manage',
            'integrations.sms',
            'pos.view_this_device_orders',
            'sms_marketing.view',
            'kitchen.production.view_all',
            'webhooks.manage',
            'xero.manage',
        ];

        foreach ($navOnly as $slug) {
            $this->assertDoesNotMatchRegularExpression(
                '/:'.preg_quote($slug, '/').'$/m',
                $fixture,
                "Expected {$slug} to remain absent from route middleware (nav/alias only)."
            );
        }
    }
}
