<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTableRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $tableId = $this->route('id');

        return [
            'name' => 'sometimes|string|max:255|unique:restaurant_tables,name,' . $tableId,
            'capacity' => 'sometimes|integer|min:1',
            'status' => 'sometimes|string|max:50',
            'location' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'is_active' => 'sometimes|boolean',
        ];
    }
}
