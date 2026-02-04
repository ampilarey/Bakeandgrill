<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;
class AuditLogService
{
    public function log(
        string $action,
        string $modelType,
        ?int $modelId,
        array $oldValues = [],
        array $newValues = [],
        array $meta = [],
        ?Request $request = null
    ): void {
        $user = $request?->user();
        
        // Only log user_id if it's a User model (staff), not Customer
        $userId = ($user instanceof \App\Models\User) ? $user->id : null;

        AuditLog::create([
            'user_id' => $userId,
            'action' => $action,
            'model_type' => $modelType,
            'model_id' => $modelId,
            'old_values' => $oldValues ?: null,
            'new_values' => $newValues ?: null,
            'meta' => $meta ?: null,
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
        ]);
    }
}
