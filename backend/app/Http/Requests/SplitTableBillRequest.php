<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SplitTableBillRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'order_id' => 'required|integer|exists:orders,id',
            'item_ids' => 'required_without:amount|array|min:1',
            'item_ids.*' => 'integer|exists:order_items,id',
            'amount' => 'required_without:item_ids|numeric|min:0.01',
        ];
    }
}
