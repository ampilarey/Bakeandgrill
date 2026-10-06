<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Telegram\Services\TelegramUpdateHandler;
use App\Http\Controllers\Controller;
use App\Models\TelegramBot;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * POST /api/telegram/webhook/{bot}. Telegram signs every call with the
 * secret given when the webhook was set; anything without it is refused.
 * Always answers 200 once accepted, so Telegram does not retry a message
 * the bot has already acted on.
 */
class TelegramWebhookController extends Controller
{
    public function handle(Request $request, int $bot, TelegramUpdateHandler $handler): JsonResponse
    {
        $model = TelegramBot::query()->find($bot);
        $secret = (string) $request->header('X-Telegram-Bot-Api-Secret-Token', '');
        if ($model === null || !$model->is_enabled || $secret === '' || !hash_equals((string) $model->webhook_secret, $secret)) {
            return response()->json(['ok' => false], 403);
        }

        $update = $request->json()->all();
        $updateId = (int) ($update['update_id'] ?? 0);
        // Telegram retries when a reply is slow; act on each update once.
        if ($updateId > 0 && !Cache::add('telegram-update:' . $model->id . ':' . $updateId, 1, now()->addDay())) {
            return response()->json(['ok' => true]);
        }

        $handler->handle($model, $update);

        return response()->json(['ok' => true]);
    }
}
