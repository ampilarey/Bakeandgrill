<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Catalog\Services\MenuBulkUpdateService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Shape only — which columns a row may carry, and whether their values are
 * legal, is {@see MenuBulkUpdateService::validate()}, because those answers
 * depend on the row's own id (unique rules) and on the caller's permissions
 * (cost price is owner-only).
 */
class BulkUpdateItemsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Either list may be empty — a save can touch only sizes — but the
            // controller refuses a call that carries neither.
            'changes' => ['present', 'array', 'max:' . MenuBulkUpdateService::MAX_ROWS],
            // `distinct` matters: the same item twice in one batch would have
            // the second row silently win, which is not what anyone drew on
            // screen.
            'changes.*.id' => ['required', 'integer', 'distinct', 'exists:items,id'],
            'changes.*.fields' => ['required', 'array', 'min:1'],
            'variant_changes' => ['sometimes', 'array', 'max:' . MenuBulkUpdateService::MAX_ROWS],
            'variant_changes.*.id' => ['required', 'integer', 'distinct', 'exists:variants,id'],
            'variant_changes.*.fields' => ['required', 'array', 'min:1'],
            // New rows typed into the bottom of the sheet. Capped harder than
            // edits: creating 500 items by accident is a different kind of
            // mess from mistyping 500 prices.
            'new_items' => ['sometimes', 'array', 'max:100'],
            'new_items.*' => ['required', 'array', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'changes.max' => 'Too many items in one save (limit ' . MenuBulkUpdateService::MAX_ROWS . '). Narrow the filter and try again.',
            'changes.*.id.distinct' => 'The same item appears twice in this save.',
            'variant_changes.max' => 'Too many sizes in one save (limit ' . MenuBulkUpdateService::MAX_ROWS . '). Narrow the filter and try again.',
            'variant_changes.*.id.distinct' => 'The same size appears twice in this save.',
            'new_items.max' => 'Too many new items in one save (limit 100).',
        ];
    }
}
