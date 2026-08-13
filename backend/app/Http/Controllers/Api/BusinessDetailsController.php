<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\BusinessDetailsKeys;
use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Domains\Content\ContentScopeMismatch;
use App\Http\Controllers\Controller;
use App\Models\SiteSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Edits the shared business record (invoices, receipts, signage, SMS).
 * Never writes website or order_app scopes.
 */
class BusinessDetailsController extends Controller
{
    public function show(): JsonResponse
    {
        $fields = [];
        foreach (BusinessDetailsKeys::all() as $key) {
            $meta = ContentRegistry::block($key) ?? [];
            $fields[] = [
                'key' => $key,
                'label' => $meta['label'] ?? $key,
                'type' => $meta['type'] ?? 'text',
                'group' => $meta['group'] ?? 'General',
                'description' => $meta['description'] ?? null,
                'value' => SiteSetting::getScoped($key, 'shared', 'en'),
                'default' => ContentRegistry::default($key),
            ];
        }

        return response()->json([
            'scope' => 'shared',
            'fields' => $fields,
            'notice' => 'These values appear on invoices, printed receipts, signage and SMS — not on the website or order app. Edit Website Content or Order App Content to change what customers see there.',
            'mismatches' => ContentScopeMismatch::collect('en'),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.key' => ['required', 'string', Rule::in(BusinessDetailsKeys::all())],
            'changes.*.value' => ['nullable', 'string'],
        ]);

        foreach ($data['changes'] as $change) {
            $key = (string) $change['key'];
            $value = (string) ($change['value'] ?? '');
            // Direct shared write — never ContentWriter (app scopes stay untouched).
            SiteSetting::set($key, $value, 'shared', 'en');
        }

        SiteSetting::bust();
        ContentResolver::bust();

        return $this->show();
    }
}
