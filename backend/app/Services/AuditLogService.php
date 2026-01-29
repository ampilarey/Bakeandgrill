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

        AuditLog::create([
            'user_id' => $user?->id,
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
