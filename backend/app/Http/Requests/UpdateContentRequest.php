<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domains\Content\ContentValidationService;
use App\Domains\Content\ContentRegistry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.key' => ['required', 'string', Rule::in(array_keys(ContentRegistry::blocks()))],
            // Content Hub writes Website / Order App only. Shared is Business Details.
            'changes.*.scope' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'changes.*.locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
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
                $scope = (string) ($change['scope'] ?? '');
                $value = $change['value'] ?? null;

                try {
                    app(ContentValidationService::class)->normalizeForWrite($key, $scope, $value);
                } catch (ValidationException $e) {
                    foreach ($e->errors() as $field => $messages) {
                        $target = in_array($field, ['key', 'scope', 'value'], true)
                            ? "changes.{$i}.{$field}"
                            : "changes.{$i}.value";
                        foreach ($messages as $msg) {
                            $validator->errors()->add($target, $msg);
                        }
                    }
                }
            }
        });
    }
}
