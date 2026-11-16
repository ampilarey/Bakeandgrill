<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Bills;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Reads a bill with Google Gemini (the generateContent REST call), with the same
 * instructions as Claude and an answer in the same shape (BillVision::SCHEMA).
 * Called only through BillVision::read().
 */
class GeminiVision
{
    /**
     * @return array<string, mixed> matching BillVision::SCHEMA
     *
     * @throws BillUnreadable
     */
    public function read(string $bytes, string $mime, string $context, string $key, string $model, int $timeout = 150): array
    {
        $base = rtrim((string) config('services.gemini.base_url', 'https://generativelanguage.googleapis.com'), '/');
        $body = [
            'systemInstruction' => ['parts' => [['text' => BillVision::INSTRUCTIONS . "\n\n" . $context]]],
            'contents' => [[
                'role' => 'user',
                'parts' => [
                    ['inlineData' => ['mimeType' => $mime, 'data' => base64_encode($bytes)]],
                    ['text' => 'Read this bill.'],
                ],
            ]],
            'generationConfig' => [
                'responseMimeType' => 'application/json',
                'responseSchema' => self::schema(BillVision::SCHEMA),
                // A bill is read, not pondered (owner, 2026-11-16: the Test ran past a minute and
                // the host cut it off): little thinking, so the answer comes in seconds.
                'thinkingConfig' => ['thinkingLevel' => 'low'],
            ],
        ];
        $send = fn (array $body) => Http::withHeaders(['x-goog-api-key' => $key])
            ->timeout($timeout)->connectTimeout(15)
            ->post($base . '/v1beta/models/' . rawurlencode($model) . ':generateContent', $body);
        try {
            $res = $send($body);
            // A model that does not take a thinking level says so: asked again without one.
            if ($res->status() === 400 && stripos((string) $res->json('error.message', ''), 'thinking') !== false) {
                unset($body['generationConfig']['thinkingConfig']);
                $res = $send($body);
            }
        } catch (ConnectionException $e) {
            Log::warning('Bill reading (Gemini): no connection', ['error' => $e->getMessage()]);
            throw new BillUnreadable(str_contains($e->getMessage(), 'timed out') || str_contains($e->getMessage(), 'cURL error 28')
                ? 'Google took too long to answer. Try again in a minute, or type another model in the Model box.'
                : 'The reader could not be reached. Try this bill again in a minute.', retry: true);
        }

        if (!$res->successful()) {
            $status = $res->status();
            $said = (string) $res->json('error.message', '');
            Log::warning('Bill reading (Gemini) failed', ['status' => $status, 'error' => mb_substr($said, 0, 300)]);
            throw match (true) {
                $status === 429 => new BillUnreadable('The reader is busy just now, or the Google account is out of quota. Try again in a minute.', retry: true),
                $status === 404 => new BillUnreadable("Google does not know the model \"{$model}\". Clear the model box to use the usual one."),
                $status === 401, $status === 403, stripos($said, 'API key') !== false => new BillUnreadable('The Google key was refused. Check the key and that the Gemini API is switched on for it.'),
                $status >= 500 => new BillUnreadable('The reader did not answer. Try this bill again in a minute.', retry: true),
                $status === 400 && $said !== '' => new BillUnreadable('Google refused the request: ' . mb_substr($said, 0, 200)),
                default => new BillUnreadable('The reader could not take this file. Try a clearer photo, or type the bill.'),
            };
        }

        if ($res->json('promptFeedback.blockReason')) {
            throw new BillUnreadable('The reader would not read this file. Type this bill by hand.');
        }
        if ($res->json('candidates.0.finishReason') === 'MAX_TOKENS') {
            throw new BillUnreadable('This bill is too long to read in one go. Send it a page at a time.');
        }

        $text = '';
        foreach ((array) $res->json('candidates.0.content.parts', []) as $part) {
            // A part marked `thought` is the model's working, not its answer.
            if (is_array($part) && empty($part['thought']) && isset($part['text'])) {
                $text .= $part['text'];
            }
        }
        $data = json_decode($text, true);
        if (!is_array($data)) {
            throw new BillUnreadable('The reader gave no answer for this bill. Try it again.', retry: true);
        }

        return $data;
    }

    /**
     * The shared schema in Gemini's dialect: its type names in capitals, and without
     * `additionalProperties`, which its responseSchema does not take.
     *
     * @param array<string, mixed> $schema
     * @return array<string, mixed>
     */
    public static function schema(array $schema): array
    {
        unset($schema['additionalProperties']);
        if (isset($schema['type']) && is_string($schema['type'])) {
            $schema['type'] = strtoupper($schema['type']);
        }
        foreach ($schema['properties'] ?? [] as $name => $child) {
            $schema['properties'][$name] = self::schema($child);
        }
        if (isset($schema['items'])) {
            $schema['items'] = self::schema($schema['items']);
        }

        return $schema;
    }
}
