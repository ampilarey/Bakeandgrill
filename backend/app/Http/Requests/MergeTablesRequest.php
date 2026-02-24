<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class MergeTablesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'source_table_id' => 'required|integer|exists:restaurant_tables,id',
            'target_table_id' => 'required|integer|exists:restaurant_tables,id|different:source_table_id',
        ];
    }
}
