<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Social\Services\MetaConnectService;
use App\Domains\Social\Services\SocialChannelHealthChecker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use RuntimeException;

/**
 * "Connect with Facebook" for the Channels tab. start/pending/finish are
 * owner-only API calls (social.channels.manage); callback is the public
 * web route Facebook sends the browser back to — it trusts nothing but
 * the unguessable state, stores what was learned under it, and bounces
 * to the admin app, which finishes with the owner's own token.
 */
class SocialMetaConnectController extends Controller
{
    public function __construct(private readonly MetaConnectService $meta) {}

    public function start(Request $request): JsonResponse
    {
        try {
            return response()->json(['redirect_url' => $this->meta->start((int) $request->user()->id)]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function callback(Request $request): RedirectResponse
    {
        $state = (string) $request->query('state', '');
        $code = (string) $request->query('code', '');
        $admin = url('/admin/social');

        if ($state === '' || $code === '') {
            $reason = (string) ($request->query('error_description') ?: $request->query('error') ?: 'Facebook sent no code back.');

            return redirect()->to($admin . '?meta_error=' . rawurlencode($reason));
        }

        try {
            $this->meta->handleCallback($state, $code);
        } catch (RuntimeException $e) {
            return redirect()->to($admin . '?meta_error=' . rawurlencode($e->getMessage()));
        }

        return redirect()->to($admin . '?meta_connect=' . rawurlencode($state));
    }

    public function pending(Request $request): JsonResponse
    {
        try {
            return response()->json(['pages' => $this->meta->pending((string) $request->query('state', ''), (int) $request->user()->id)]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function finish(Request $request, SocialChannelHealthChecker $checker): JsonResponse
    {
        $data = $request->validate([
            'state' => ['required', 'string'],
            'page_id' => ['required', 'string'],
            'facebook' => ['sometimes', 'boolean'],
            'instagram' => ['sometimes', 'boolean'],
            'is_test_channel' => ['sometimes', 'boolean'],
        ]);

        try {
            $channels = $this->meta->finish(
                $data['state'],
                (int) $request->user()->id,
                $data['page_id'],
                (bool) ($data['facebook'] ?? true),
                (bool) ($data['instagram'] ?? false),
                (bool) ($data['is_test_channel'] ?? false),
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        // Check straight away so the tab shows "Connected as …" rather than
        // waiting for tomorrow's 09:15 run.
        foreach ($channels as $channel) {
            $checker->check($channel);
        }

        return response()->json(['channel_ids' => array_map(fn ($c) => $c->id, $channels)]);
    }
}
