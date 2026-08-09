<?php

declare(strict_types=1);

namespace App\Domains\Content\Blocks;

use App\Domains\Content\ContentRegistry;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

final class PageBlockValidator
{
    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     *
     * @throws ValidationException
     */
    public static function validateInstance(array $payload, ?string $existingType = null): array
    {
        $apps = ContentRegistry::APPS;
        $validator = Validator::make($payload, [
            'app' => 'required|string|in:'.implode(',', $apps),
            'page' => 'required|string|max:64',
            'block_type' => 'required|string|max:64',
            'position' => 'nullable|integer|min:0|max:9999',
            'is_enabled' => 'nullable|boolean',
            'content_mode' => 'nullable|string|in:shared,own',
            'settings' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            throw new ValidationException($validator);
        }

        $data = $validator->validated();
        $type = (string) $data['block_type'];
        $def = BlockTypeRegistry::get($type);

        if ($def === null) {
            throw ValidationException::withMessages([
                'block_type' => "Unknown block type “{$type}”.",
            ]);
        }

        if (! $def->allowsApp((string) $data['app'])) {
            throw ValidationException::withMessages([
                'block_type' => "“{$def->label}” cannot be added to the {$data['app']} home page.",
            ]);
        }

        if ($existingType !== null && $existingType !== $type) {
            throw ValidationException::withMessages([
                'block_type' => 'Block type cannot be changed after creation.',
            ]);
        }

        if (array_key_exists('is_enabled', $data) && $data['is_enabled'] === false && ! $def->removable) {
            throw ValidationException::withMessages([
                'is_enabled' => $def->nonRemovableReason
                    ?? "“{$def->label}” cannot be turned off.",
            ]);
        }

        $settings = $data['settings'] ?? [];
        if (! is_array($settings)) {
            $settings = [];
        }

        if ($def->settingsSchema !== []) {
            $settingsValidator = Validator::make($settings, $def->settingsSchema);
            if ($settingsValidator->fails()) {
                throw ValidationException::withMessages(
                    collect($settingsValidator->errors()->toArray())
                        ->mapWithKeys(fn ($msgs, $key) => ["settings.{$key}" => $msgs])
                        ->all()
                );
            }
            $settings = $settingsValidator->validated();
        }

        $mode = (string) ($data['content_mode'] ?? 'shared');
        if ($mode === 'shared' && ! $def->supportsSharedContent) {
            // Own-only types still accept "shared" as a no-op flag — coerce to own.
            $mode = 'own';
        }

        return [
            'app' => (string) $data['app'],
            'page' => (string) $data['page'],
            'block_type' => $type,
            'position' => (int) ($data['position'] ?? 0),
            'is_enabled' => array_key_exists('is_enabled', $data) ? (bool) $data['is_enabled'] : true,
            'content_mode' => $mode,
            'settings' => $settings,
        ];
    }

    /**
     * @throws ValidationException
     */
    public static function assertCanDelete(string $blockType): void
    {
        $def = BlockTypeRegistry::get($blockType);
        if ($def !== null && ! $def->removable) {
            throw ValidationException::withMessages([
                'block_type' => $def->nonRemovableReason
                    ?? "“{$def->label}” cannot be removed.",
            ]);
        }
    }
}
