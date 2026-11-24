<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\NotFoundException;
use Anthropic\Core\Exceptions\PermissionDeniedException;
use Anthropic\Core\Exceptions\RateLimitException;
use App\Domains\Inventory\Bills\BillReaderSettings;
use App\Domains\Inventory\Bills\GeminiVision;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The one place the assistant features ask Claude (or Google Gemini) for something
 * (owner, 2026-11-24: "Build all. But add admin settings to on/off"). Supplier bills keep
 * their own reader (BillVision); everything else comes through ask(): instructions, the
 * thing to work on, and the shape the answer must take. The service, its key and its model
 * are the ones picked under Purchasing → Settings → Reading bills (BillReaderSettings),
 * so there is one key and one place to type it. Which features may call is AiFeatures.
 * Tests bind a stand-in for this class.
 */
class Assistant
{
    public function __construct(private readonly BillReaderSettings $settings) {}

    /** True when the picked service has a key. */
    public function ready(): bool
    {
        return $this->settings->key($this->settings->provider()) !== '';
    }

    /**
     * @param string $instructions who the assistant is and the rules for this job
     * @param string $prompt what to work on
     * @param array<string, mixed> $schema the JSON the answer must be (every field required)
     * @param array{bytes: string, mime: string}|null $file a picture or PDF to read
     * @return array<string, mixed> matching $schema
     *
     * @throws AssistantUnavailable
     */
    public function ask(string $instructions, string $prompt, array $schema, ?array $file = null, int $timeout = 60, int $maxTokens = 4000): array
    {
        $provider = $this->settings->provider();
        $key = $this->settings->key($provider);
        if ($key === '') {
            throw new AssistantUnavailable('The assistant is not set up yet: add a key under Purchasing → Settings → Reading bills.');
        }
        $model = $this->settings->model($provider);

        return $provider === 'google'
            ? $this->askGemini($instructions, $prompt, $schema, $file, $key, $model, $timeout, $maxTokens)
            : $this->askClaude($instructions, $prompt, $schema, $file, $key, $model, $timeout, $maxTokens);
    }

    /**
     * @param array<string, mixed> $schema
     * @param array{bytes: string, mime: string}|null $file
     * @return array<string, mixed>
     */
    private function askClaude(string $instructions, string $prompt, array $schema, ?array $file, string $key, string $model, int $timeout, int $maxTokens): array
    {
        $base = trim((string) config('services.anthropic.base_url'));
        $client = new Client(apiKey: $key, baseUrl: $base !== '' ? $base : null);

        $content = [];
        if ($file !== null) {
            $content[] = $file['mime'] === 'application/pdf'
                ? ['type' => 'document', 'source' => ['type' => 'base64', 'mediaType' => 'application/pdf', 'data' => base64_encode($file['bytes'])]]
                : ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $file['mime'], 'data' => base64_encode($file['bytes'])]];
        }
        $content[] = ['type' => 'text', 'text' => $prompt];

        try {
            $message = $client->beta->messages->create(
                maxTokens: $maxTokens,
                messages: [['role' => 'user', 'content' => $content]],
                model: $model,
                system: [['type' => 'text', 'text' => $instructions]],
                outputConfig: ['effort' => 'low', 'format' => ['type' => 'json_schema', 'schema' => $schema]],
                requestOptions: ['timeout' => (float) $timeout, 'maxRetries' => 1],
            );
        } catch (AuthenticationException|PermissionDeniedException $e) {
            Log::warning('Assistant: the Claude key was refused', ['error' => $e->getMessage()]);
            throw new AssistantUnavailable('The Claude key was refused. Check the key and that the account has credit.');
        } catch (RateLimitException) {
            throw new AssistantUnavailable('The assistant is busy just now. Try again in a minute.');
        } catch (NotFoundException) {
            throw new AssistantUnavailable("Claude does not know the model \"{$model}\". Clear the model box under Reading bills to use the usual one.");
        } catch (APIStatusException $e) {
            Log::warning('Assistant failed', ['status' => $e->status ?? null, 'error' => $e->getMessage()]);
            throw new AssistantUnavailable('The assistant did not answer. Try again in a minute.');
        } catch (APIConnectionException $e) {
            Log::warning('Assistant: no connection', ['error' => $e->getMessage()]);
            throw new AssistantUnavailable('The assistant could not be reached. Try again in a minute.');
        }

        if ($message->stopReason === 'refusal') {
            throw new AssistantUnavailable('The assistant would not do this one. Please type it by hand.');
        }
        foreach ($message->content as $block) {
            if ($block->type === 'text') {
                $data = json_decode($block->text, true);
                if (is_array($data)) {
                    return $data;
                }
            }
        }

        throw new AssistantUnavailable('The assistant gave no answer. Try again.');
    }

    /**
     * @param array<string, mixed> $schema
     * @param array{bytes: string, mime: string}|null $file
     * @return array<string, mixed>
     */
    private function askGemini(string $instructions, string $prompt, array $schema, ?array $file, string $key, string $model, int $timeout, int $maxTokens): array
    {
        $base = rtrim((string) config('services.gemini.base_url', 'https://generativelanguage.googleapis.com'), '/');
        $parts = [];
        if ($file !== null) {
            $parts[] = ['inlineData' => ['mimeType' => $file['mime'], 'data' => base64_encode($file['bytes'])]];
        }
        $parts[] = ['text' => $prompt];
        $body = [
            'systemInstruction' => ['parts' => [['text' => $instructions]]],
            'contents' => [['role' => 'user', 'parts' => $parts]],
            'generationConfig' => [
                'responseMimeType' => 'application/json',
                'responseSchema' => GeminiVision::schema($schema),
                'thinkingConfig' => ['thinkingLevel' => 'low'],
            ],
        ];
        $send = fn (array $body) => Http::withHeaders(['x-goog-api-key' => $key])
            ->timeout($timeout)->connectTimeout(15)
            ->post($base . '/v1beta/models/' . rawurlencode($model) . ':generateContent', $body);
        try {
            $res = $send($body);
            if ($res->status() === 400 && stripos((string) $res->json('error.message', ''), 'thinking') !== false) {
                unset($body['generationConfig']['thinkingConfig']);
                $res = $send($body);
            }
        } catch (ConnectionException $e) {
            Log::warning('Assistant (Gemini): no connection', ['error' => $e->getMessage()]);
            throw new AssistantUnavailable('The assistant could not be reached. Try again in a minute.');
        }
        if (!$res->successful()) {
            $status = $res->status();
            Log::warning('Assistant (Gemini) failed', ['status' => $status, 'error' => mb_substr((string) $res->json('error.message', ''), 0, 300)]);
            throw new AssistantUnavailable(match (true) {
                $status === 429 => 'The assistant is busy just now, or the Google account is out of quota. Try again in a minute.',
                $status === 401, $status === 403 => 'The Google key was refused. Check the key and that the Gemini API is switched on for it.',
                $status === 404 => "Google does not know the model \"{$model}\". Clear the model box under Reading bills to use the usual one.",
                default => 'The assistant did not answer. Try again in a minute.',
            });
        }
        if ($res->json('promptFeedback.blockReason')) {
            throw new AssistantUnavailable('The assistant would not do this one. Please type it by hand.');
        }
        $text = '';
        foreach ((array) $res->json('candidates.0.content.parts', []) as $part) {
            if (is_array($part) && empty($part['thought']) && isset($part['text'])) {
                $text .= $part['text'];
            }
        }
        $data = json_decode($text, true);
        if (!is_array($data)) {
            throw new AssistantUnavailable('The assistant gave no answer. Try again.');
        }

        return $data;
    }
}
