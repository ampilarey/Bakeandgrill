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
            'changes' => ['required', 'array', 'min:1', 'max:' . MenuBulkUpdateService::MAX_ROWS],
            // `distinct` matters: the same item twice in one batch would have
            // the second row silently win, which is not what anyone drew on
            // screen.
            'changes.*.id' => ['required', 'integer', 'distinct', 'exists:items,id'],
            'changes.*.fields' => ['required', 'array', 'min:1'],
        ];
    }

    public function messages(): array
    {
        return [
            'changes.max' => 'Too many items in one save (limit ' . MenuBulkUpdateService::MAX_ROWS . '). Narrow the filter and try again.',
            'changes.*.id.distinct' => 'The same item appears twice in this save.',
        ];
    }
}
