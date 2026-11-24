<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use App\Domains\Inventory\Bills\BillReaderSettings;
use App\Models\SiteSetting;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Makes a picture from words (owner, 2026-11-24: "I need generate food photo too").
 * Claude reads pictures and cannot make one, so this asks Google's image model through
 * the same generateContent call the bill reader uses, with the Google key typed under
 * Purchasing → Settings → Reading bills (whichever service reads the bills). The model's
 * name can be typed on System → Integrations → Assistant, as Google renames these often.
 * A picture made here is only ever a suggestion: AiSuggestions keeps it for a person to
 * approve before it goes anywhere a customer sees. Tests bind a stand-in.
 */
class ImageMaker
{
    public const DEFAULT_MODEL = 'gemini-2.5-flash-image';

    public function __construct(private readonly BillReaderSettings $settings) {}

    public function ready(): bool
    {
        return $this->settings->key('google') !== '';
    }

    public function model(): string
    {
        $typed = trim((string) SiteSetting::get('ai_image_model', ''));

        return $typed !== '' ? $typed : self::DEFAULT_MODEL;
    }

    public static function setModel(string $model): void
    {
        SiteSetting::set('ai_image_model', trim($model));
    }

    /**
     * @return string the picture's bytes (PNG or JPEG)
     *
     * @throws AssistantUnavailable
     */
    public function make(string $prompt, int $timeout = 120): string
    {
        $key = $this->settings->key('google');
        if ($key === '') {
            throw new AssistantUnavailable('Making pictures needs a Google key: add one under Purchasing → Settings → Reading bills.');
        }
        $model = $this->model();
        $base = rtrim((string) config('services.gemini.base_url', 'https://generativelanguage.googleapis.com'), '/');
        try {
            $res = Http::withHeaders(['x-goog-api-key' => $key])->timeout($timeout)->connectTimeout(15)
                ->post($base . '/v1beta/models/' . rawurlencode($model) . ':generateContent', [
                    'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                    'generationConfig' => ['responseModalities' => ['TEXT', 'IMAGE']],
                ]);
        } catch (ConnectionException $e) {
            Log::warning('Image maker: no connection', ['error' => $e->getMessage()]);
            throw new AssistantUnavailable('The picture service could not be reached. Try again in a minute.');
        }
        if (!$res->successful()) {
            $status = $res->status();
            $said = mb_substr((string) $res->json('error.message', ''), 0, 200);
            Log::warning('Image maker failed', ['status' => $status, 'error' => $said]);
            throw new AssistantUnavailable(match (true) {
                $status === 429 => 'The picture service is busy, or the Google account is out of quota. Try again later.',
                $status === 401, $status === 403 => 'The Google key was refused for making pictures. Check the key and that image generation is switched on for it.',
                $status === 404 => "Google does not know the picture model \"{$model}\". Type the current one under System → Integrations → Assistant.",
                $status === 400 && $said !== '' => 'Google refused the request: ' . $said,
                default => 'The picture service did not answer. Try again in a minute.',
            });
        }
        foreach ((array) $res->json('candidates.0.content.parts', []) as $part) {
            $data = is_array($part) ? ($part['inlineData']['data'] ?? $part['inline_data']['data'] ?? null) : null;
            if (is_string($data) && $data !== '') {
                $bytes = base64_decode($data, true);
                if ($bytes !== false && @getimagesizefromstring($bytes) !== false) {
                    return $bytes;
                }
            }
        }

        throw new AssistantUnavailable('The picture service gave no picture for this one.');
    }
}
