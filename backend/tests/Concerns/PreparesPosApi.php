<?php

declare(strict_types=1);

namespace Tests\Concerns;

use App\Domains\Permissions\PermissionCatalog;
use App\Domains\Permissions\PermissionCatalogSync;
use App\Models\Device;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

/**
 * Opens a POS shift and grants ring-sales permissions for feature tests.
 */
trait PreparesPosApi
{
    private bool $posApiReady = false;

    protected function preparePosApi(User $user, Device|string $device, float $openingCash = 100): void
    {
        PermissionCatalogSync::sync();

        $user->loadMissing('role');
        $roleSlug = $user->role?->slug;

        if (!in_array($roleSlug, ['owner', 'manager', 'staff'], true)) {
            foreach (PermissionCatalog::staffSlugs() as $slug) {
                $user->grantPermission($slug);
            }
            $user->unsetRelation('permissions');
        }

        Sanctum::actingAs($user, ['staff']);

        $identifier = $device instanceof Device ? $device->identifier : $device;

        $response = $this->withHeader('X-Device-Identifier', $identifier)
            ->postJson('/api/shifts/open', ['opening_cash' => $openingCash]);

        if ($response->status() === 422 && str_contains((string) $response->json('message'), 'already open')) {
            $this->posApiReady = true;

            return;
        }

        $response->assertCreated();

        $this->posApiReady = true;
    }

    protected function ensurePosApiReady(User $user, Device|string $device, float $openingCash = 100): void
    {
        if ($this->posApiReady) {
            return;
        }

        $this->preparePosApi($user, $device, $openingCash);
    }
}
