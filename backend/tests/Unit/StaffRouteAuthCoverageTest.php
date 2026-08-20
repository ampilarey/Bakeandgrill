<?php

declare(strict_types=1);

namespace Tests\Unit;

use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Every staff.token route must carry permission middleware OR appear here with
 * a written reason pointing at the controller/service check that authorises it.
 * New ungated staff routes fail until gated or justified.
 */
class StaffRouteAuthCoverageTest extends TestCase
{
    /**
     * METHOD uri => one-line reason (where auth actually lives).
     *
     * @var array<string, string>
     */
    private const ALLOWLIST = [
        'POST api/auth/logout' => 'api/auth/logout — any signed-in staff; StaffAuthController::logout',
        'POST api/auth/logout-everywhere' => 'api/auth/logout-everywhere — any signed-in staff; revokes only their OWN tokens',
        'GET api/auth/me' => 'api/auth/me — any signed-in staff; returns own identity + permissions',
        'PATCH api/auth/me/preferences' => 'api/auth/me/preferences — any signed-in staff; updates own prefs only',
        'POST api/devices/self-register' => 'api/devices/self-register — any signed-in staff; DeviceController::selfRegister (own device)',
        'GET api/devices/self-status' => 'api/devices/self-status — any signed-in staff; DeviceController::selfStatus (own device)',
        'GET api/pos/bootstrap' => 'api/pos/bootstrap — any signed-in staff; PosBootstrapController, no privileged writes',
        'GET api/pos/menu' => 'api/pos/menu — any signed-in staff; PosMenuController catalog read for POS',
        'GET api/pos/events' => 'api/pos/events — device.active middleware; PosEventController SSE for active POS device',
        'GET api/items/{id}/barcode-label' => 'api/items/{id}/barcode-label — any signed-in staff; ItemController::barcodeLabel print helper',
        'GET api/orders/{id}' => 'api/orders/{id} — OrderVisibilityService in OrderCreationController::show',
        'GET api/purchase-requests/{id}' => 'api/purchase-requests/{id} — PurchaseRequestService::canView via PurchaseRequestController::show',
        'POST api/purchase-requests/{id}/cancel' => 'api/purchase-requests/{id}/cancel — requester or purchase_requests.cancel in PurchaseRequestController::cancel',
        'POST api/purchase-requests/{id}/attachments' => 'api/purchase-requests/{id}/attachments — canView gate in PurchaseRequestController::uploadAttachment',
        'GET api/purchase-requests/{id}/items/{itemId}/quotes' => 'api/purchase-requests/{id}/items/{itemId}/quotes — canView gate in PurchaseRequestController::listQuotes',
        'GET api/kitchen-production/{id}' => 'api/kitchen-production/{id} — KitchenProductionController::authorizeView',
        'POST api/kitchen-production/{id}/cancel' => 'api/kitchen-production/{id}/cancel — ownership or kitchen.production.manage in KitchenProductionService::cancelBatch',
        'POST api/pos/loyalty/preview' => 'api/pos/loyalty/preview — loyalty.redeem check in LoyaltyController::posHoldPreview',
        'POST api/pos/loyalty/hold' => 'api/pos/loyalty/hold — loyalty.redeem check in LoyaltyController::posHold',
        'DELETE api/pos/loyalty/hold/{orderId}' => 'api/pos/loyalty/hold/{orderId} — loyalty.redeem check in LoyaltyController::posReleaseHold',
        'POST api/pos/promos/preview' => 'api/pos/promos/preview — promotions.discounts check in PromotionController::posPreview',
        'POST api/pos/orders/{orderId}/gift-card' => 'api/pos/orders/{orderId}/gift-card — promotions.discounts in GiftCardController::staffApplyToOrder',
        'DELETE api/pos/orders/{orderId}/gift-card' => 'api/pos/orders/{orderId}/gift-card — promotions.discounts in GiftCardController::staffRemoveFromOrder',
        'GET api/admin/sms/control-center' => 'api/admin/sms/control-center — sms.settings.manage|sms.logs.view in SmsControlCenterController::index',
        'GET api/admin/media/video/capabilities' => 'api/admin/media/video/capabilities — VideoStudioController::authorizeStudio (media.view|manage|website.manage)',
        'POST api/admin/media/video/probe' => 'api/admin/media/video/probe — VideoStudioController::authorizeStudio (media.manage|website.manage)',
        'POST api/admin/media/video/process' => 'api/admin/media/video/process — VideoStudioController::authorizeStudio (media.manage|website.manage)',
        'POST api/admin/media/{media}/use-as' => 'api/admin/media/{media}/use-as — media.manage|website.manage in MediaLibraryController::useAs',
        // LIVE→TEST clone is intentionally owner-only (role:owner), not a assignable permission slug.
        'GET api/admin/ops/clone-live-to-test' => 'api/admin/ops/clone-live-to-test — role:owner in staff.php (CloneLiveToTestController::status)',
        'POST api/admin/ops/clone-live-to-test' => 'api/admin/ops/clone-live-to-test — role:owner in staff.php (CloneLiveToTestController::start)',
    ];

    #[Test]
    public function every_staff_token_route_has_permission_middleware_or_allowlist_reason(): void
    {
        $ungated = [];
        foreach (Route::getRoutes() as $route) {
            $middleware = $route->gatherMiddleware();
            if (!$this->hasStaffToken($middleware)) {
                continue;
            }
            if ($this->hasPermissionMiddleware($middleware)) {
                continue;
            }

            $methods = array_values(array_diff($route->methods(), ['HEAD']));
            foreach ($methods as $method) {
                $key = $method.' '.$route->uri();
                $ungated[$key] = $route->getActionName();
            }
        }

        ksort($ungated);

        $missingAllowlist = [];
        foreach ($ungated as $key => $action) {
            if (!isset(self::ALLOWLIST[$key])) {
                $missingAllowlist[] = $key.' → '.$action;
            }
        }

        $staleAllowlist = array_values(array_diff(array_keys(self::ALLOWLIST), array_keys($ungated)));

        $this->assertSame(
            [],
            $missingAllowlist,
            "Staff routes without permission middleware must be justified in StaffRouteAuthCoverageTest::ALLOWLIST.\n"
            .implode("\n", $missingAllowlist)
        );

        $this->assertSame(
            [],
            $staleAllowlist,
            'ALLOWLIST entries that are no longer ungated staff routes (remove or they hide real gaps): '
            .implode(', ', $staleAllowlist)
        );

        foreach (self::ALLOWLIST as $key => $reason) {
            $this->assertNotSame('', trim($reason), "Allowlist reason for {$key} must be non-empty.");
            $this->assertStringContainsString(' — ', $reason, "Allowlist reason for {$key} must include a one-line location after ' — '.");
        }
    }

    /** @param list<string|object> $middleware */
    private function hasStaffToken(array $middleware): bool
    {
        foreach ($middleware as $m) {
            $s = is_string($m) ? $m : (is_object($m) ? $m::class : '');
            if ($s === 'staff.token' || str_contains($s, 'EnsureStaffToken')) {
                return true;
            }
        }

        return false;
    }

    /** @param list<string|object> $middleware */
    private function hasPermissionMiddleware(array $middleware): bool
    {
        foreach ($middleware as $m) {
            $s = is_string($m) ? $m : (is_object($m) ? $m::class : '');
            if (
                str_starts_with($s, 'permission:')
                || str_starts_with($s, 'permission.any:')
                || str_contains($s, 'RequirePermission')
                || str_contains($s, 'RequireAnyPermission')
            ) {
                return true;
            }
        }

        return false;
    }
}
