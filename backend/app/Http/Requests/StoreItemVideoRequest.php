<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreItemVideoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $maxKb = (int) config('menu_media.video.max_kb', 8192);
        $mimes = implode(',', config('menu_media.video.mimetypes', ['video/mp4', 'video/webm']));

        return [
            'media_type' => ['required', 'in:video'],
            'video' => [
                'required',
                'file',
                'max:'.$maxKb,
                'mimetypes:'.$mimes,
            ],
            'poster' => [
                'required',
                'file',
                'image',
                'mimes:jpeg,jpg,png,webp',
                'max:'.(int) config('menu_media.image.max_kb', 10240),
            ],
            'alt_text' => ['nullable', 'string', 'max:200'],
            'is_primary' => ['sometimes', 'boolean'],
        ];
    }

    public function messages(): array
    {
        $maxKb = (int) config('menu_media.video.max_kb', 8192);
        $maxMb = round($maxKb / 1024, 1);

        return [
            'poster.required' => 'A poster image is required for video clips.',
            'video.max' => "Video is too large. Maximum size is {$maxMb} MB.",
            'video.mimetypes' => 'Video must be MP4 or WebM.',
        ];
    }
}
