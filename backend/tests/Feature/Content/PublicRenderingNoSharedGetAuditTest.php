<?php

declare(strict_types=1);

namespace Tests\Feature\Content;

use Tests\TestCase;

/**
 * Static audit: public Website / Order App rendering paths must not call
 * unscoped SiteSetting::get() for customer-facing values.
 */
class PublicRenderingNoSharedGetAuditTest extends TestCase
{
    public function test_blade_and_public_controllers_avoid_customer_facing_sitesetting_get(): void
    {
        $roots = [
            base_path('resources/views'),
            app_path('Http/Controllers/Api'),
            app_path('Domains/Content'),
        ];

        $allowedOperational = [
            // Document / receipt / ops Blade
            'layouts/document.blade.php',
            'invoice.blade.php',
            'receipt.blade.php',
            'pos-pay.blade.php',
            'partials/order-service-charge-line.blade.php',
            // Controllers that are intentionally ops / document
            'BusinessDetailsController.php',
            'SiteSettingsController.php', // index() is shared admin; public() uses resolver
            'PublicComplaintController.php',
            'PublicSignageController.php',
            'MediaLibraryController.php',
            'CateringRequestController.php',
            'EventOrderController.php',
            'FeatureGateController.php',
            'OnlineOrderingController.php',
            'Signage/SignageAdminController.php',
            'SmsControlCenterController.php',
            // Content domain ops helpers
            'BusinessDetailsKeys.php',
            'ContentScopeMismatch.php',
            'ContentResolver.php', // may mention getScoped, not get(
        ];

        $violations = [];
        foreach ($roots as $root) {
            if (! is_dir($root)) {
                continue;
            }
            $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root));
            foreach ($iterator as $file) {
                if (! $file->isFile()) {
                    continue;
                }
                $path = $file->getPathname();
                if (! str_ends_with($path, '.php') && ! str_ends_with($path, '.blade.php')) {
                    continue;
                }
                $rel = str_replace(base_path().'/', '', $path);
                $base = basename($path);
                foreach ($allowedOperational as $allow) {
                    if (str_ends_with($rel, $allow) || $base === $allow) {
                        continue 2;
                    }
                }
                $src = file_get_contents($path) ?: '';
                if (preg_match('/SiteSetting::get\s*\(/', $src)) {
                    // Special-case: SiteSettingsController::public uses ContentResolver
                    // but file also has get in index — allow whole controller above.
                    $violations[] = $rel;
                }
            }
        }

        $this->assertSame([], $violations, "Customer-facing paths still call SiteSetting::get():\n".implode("\n", $violations));
    }
}
