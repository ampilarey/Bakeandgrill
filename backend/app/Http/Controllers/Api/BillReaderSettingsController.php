<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Inventory\Bills\BillReader;
use App\Domains\Inventory\Bills\BillReaderSettings;
use App\Domains\Inventory\Bills\BillUnreadable;
use App\Http\Controllers\Controller;
use App\Services\AuditLogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Purchasing → Settings → Reading bills: which service reads supplier bills (Claude or
 * Google Gemini), its key and its model. A key goes in and never comes back out: the
 * screen is told only that there is one and its last four characters.
 */
class BillReaderSettingsController extends Controller
{
    public function show(BillReaderSettings $settings): JsonResponse
    {
        return response()->json($settings->present());
    }

    public function update(Request $request, BillReaderSettings $settings): JsonResponse
    {
        $providers = array_keys(BillReaderSettings::PROVIDERS);
        $data = $request->validate([
            'provider' => ['sometimes', Rule::in($providers)],
            // Who bills are made out to, separated by commas. Empty puts the usual names back.
            'our_names' => ['sometimes', 'nullable', 'string', 'max:300'],
            // A key that is sent replaces the stored one; "" removes it. Not sent, it is kept.
            'keys' => ['sometimes', 'array'],
            'keys.*' => ['nullable', 'string', 'max:400'],
            'models' => ['sometimes', 'array'],
            'models.*' => ['nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._:\-]*$/'],
        ], ['models.*.regex' => 'A model name is letters, numbers, dots and dashes only.']);

        $changed = [];
        foreach ($providers as $p) {
            if (array_key_exists($p, $data['keys'] ?? [])) {
                $settings->setKey($p, (string) $data['keys'][$p]);
                $changed[] = "{$p} key " . (trim((string) $data['keys'][$p]) === '' ? 'removed' : 'set');
            }
            if (array_key_exists($p, $data['models'] ?? [])) {
                $settings->setModel($p, (string) $data['models'][$p]);
                $changed[] = "{$p} model";
            }
        }
        if (array_key_exists('our_names', $data)) {
            $settings->setOurNames((string) $data['our_names']);
            $changed[] = 'our names';
        }
        if (isset($data['provider'])) {
            $settings->setProvider($data['provider']);
            $changed[] = 'reader: ' . $data['provider'];
        }

        // What changed, never the key.
        app(AuditLogService::class)->log('purchasing.bill_reader_updated', 'SiteSetting', null, [], ['changed' => $changed], [], $request);

        return response()->json($settings->present());
    }

    /** Send a made-up bill to one service and say what came back. */
    public function test(Request $request, BillReaderSettings $settings, BillReader $reader): JsonResponse
    {
        $data = $request->validate(['provider' => ['required', Rule::in(array_keys(BillReaderSettings::PROVIDERS))]]);
        @set_time_limit(180);
        try {
            $read = $reader->trial($data['provider']);
        } catch (BillUnreadable $e) {
            return response()->json(['ok' => false, 'message' => $e->getMessage()]);
        } catch (\Throwable $e) {
            // Owner, 2026-11-16: Test answered "Server error (500)" and nothing more. The screen is the
            // owner's own, so it says what broke (never a key: that travels in a header, not a message).
            report($e);

            return response()->json(['ok' => false, 'message' => 'The test broke on the server: ' . class_basename($e) . ': ' . mb_substr($e->getMessage(), 0, 240)]);
        }
        $label = BillReaderSettings::PROVIDERS[$data['provider']]['label'];
        $ok = $read['lines'] >= 2 && abs($read['total'] - 234.0) < 0.01;

        return response()->json([
            'ok' => $ok,
            'message' => $ok
                ? "{$label} read the test bill: {$read['shop']}, {$read['lines']} items, MVR " . number_format($read['total'], 2) . '.'
                : "{$label} answered, but did not read the test bill right ({$read['lines']} items, MVR " . number_format($read['total'], 2) . ' instead of 2 items, MVR 234.00). Try another model.',
        ]);
    }
}
