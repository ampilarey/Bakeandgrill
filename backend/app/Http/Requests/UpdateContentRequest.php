<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Content\ContentRegistry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateContentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.key' => ['required', 'string', Rule::in(array_keys(ContentRegistry::blocks()))],
            'changes.*.scope' => ['required', 'string', Rule::in(ContentRegistry::SCOPES)],
            'changes.*.value' => ['nullable'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $changes = $this->input('changes', []);
            if (!is_array($changes)) {
                return;
            }
            foreach ($changes as $i => $change) {
                if (!is_array($change)) {
                    continue;
                }
                $key = (string) ($change['key'] ?? '');
                if (!ContentRegistry::has($key)) {
                    continue;
                }
                $rule = ContentRegistry::validateRule($key);
                $value = $change['value'] ?? null;
                if (is_array($value) || is_object($value)) {
                    $value = json_encode($value, JSON_UNESCAPED_UNICODE);
                }
                $v = validator(['value' => $value], ['value' => $rule]);
                if ($v->fails()) {
                    foreach ($v->errors()->all() as $msg) {
                        $validator->errors()->add("changes.{$i}.value", $msg);
                    }
                }
            }
        });
    }
}
