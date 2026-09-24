<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Models\SocialChannel;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * "Connect with Facebook" (owner's shortlist, 2026-09-24). Until now the
 * owner had to mint a long-lived Page token in Meta's developer console
 * and paste it in. With a Meta app configured, the flow is: log in to
 * Facebook → pick the Page → we exchange the code for a long-lived user
 * token, read the Pages it manages (their tokens never expire when minted
 * this way) and the Instagram business account linked to each, and store
 * them as channels. "Reconnect" on an expiring channel is the same flow;
 * a Page already connected has its credentials replaced in place.
 *
 * State lives in the cache for ten minutes and carries the user who
 * started the flow; only that user can finish it.
 */
class MetaConnectService
{
    private const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish';

    private const STATE_TTL = 600;

    public function available(): bool
    {
        return trim((string) config('social.meta_app_id')) !== '' && trim((string) config('social.meta_app_secret')) !== '';
    }

    public function redirectUri(): string
    {
        $configured = trim((string) config('social.meta_redirect_uri'));

        return $configured !== '' ? $configured : url('/social/meta/callback');
    }

    /** Start: an unguessable state bound to the user, and the dialog URL. */
    public function start(int $userId): string
    {
        $this->assertAvailable();
        $state = Str::random(40);
        Cache::put($this->stateKey($state), ['user_id' => $userId, 'pages' => null], self::STATE_TTL);

        return 'https://www.facebook.com/' . config('social.graph_version', 'v21.0') . '/dialog/oauth?' . http_build_query([
            'client_id' => config('social.meta_app_id'),
            'redirect_uri' => $this->redirectUri(),
            'state' => $state,
            'scope' => self::SCOPES,
            'response_type' => 'code',
        ]);
    }

    /**
     * Callback: exchange the code and remember what the user can connect.
     * Throws on any failure with a message safe to show (no tokens).
     */
    public function handleCallback(string $state, string $code): void
    {
        $entry = Cache::get($this->stateKey($state));
        if (!is_array($entry)) {
            throw new RuntimeException('This connect link has expired. Start again from the Channels tab.');
        }

        $short = $this->graphGet('/oauth/access_token', [
            'client_id' => config('social.meta_app_id'),
            'client_secret' => config('social.meta_app_secret'),
            'redirect_uri' => $this->redirectUri(),
            'code' => $code,
        ]);
        $long = $this->graphGet('/oauth/access_token', [
            'grant_type' => 'fb_exchange_token',
            'client_id' => config('social.meta_app_id'),
            'client_secret' => config('social.meta_app_secret'),
            'fb_exchange_token' => (string) ($short['access_token'] ?? ''),
        ]);
        $userToken = (string) ($long['access_token'] ?? '');
        if ($userToken === '') {
            throw new RuntimeException('Facebook did not return an access token.');
        }

        $accounts = $this->graphGet('/me/accounts', [
            'fields' => 'id,name,access_token,instagram_business_account{id,username}',
            'limit' => 100,
            'access_token' => $userToken,
        ]);
        $pages = [];
        foreach (($accounts['data'] ?? []) as $page) {
            if (empty($page['id']) || empty($page['access_token'])) {
                continue;
            }
            $pages[] = [
                'page_id' => (string) $page['id'],
                'name' => (string) ($page['name'] ?? 'Page ' . $page['id']),
                'access_token' => (string) $page['access_token'],
                'instagram' => !empty($page['instagram_business_account']['id']) ? [
                    'ig_user_id' => (string) $page['instagram_business_account']['id'],
                    'username' => (string) ($page['instagram_business_account']['username'] ?? ''),
                ] : null,
                'already' => [
                    'facebook' => SocialChannel::query()->where('platform', 'facebook')->where('remote_account_id', (string) $page['id'])->exists(),
                    'instagram' => !empty($page['instagram_business_account']['id'])
                        && SocialChannel::query()->where('platform', 'instagram')->where('remote_account_id', (string) $page['instagram_business_account']['id'])->exists(),
                ],
            ];
        }
        if ($pages === []) {
            throw new RuntimeException('That Facebook login manages no Pages. Log in with the account that owns the business Page.');
        }

        $entry['pages'] = $pages;
        Cache::put($this->stateKey($state), $entry, self::STATE_TTL);
    }

    /**
     * What the user can connect, without tokens.
     *
     * @return list<array{page_id: string, name: string, instagram: ?array{ig_user_id: string, username: string}, already: array{facebook: bool, instagram: bool}}>
     */
    public function pending(string $state, int $userId): array
    {
        $entry = $this->entryFor($state, $userId);

        return array_map(fn (array $p) => [
            'page_id' => $p['page_id'],
            'name' => $p['name'],
            'instagram' => $p['instagram'],
            'already' => $p['already'],
        ], $entry['pages'] ?? []);
    }

    /**
     * Create (or refresh) the channels for one Page.
     *
     * @return list<SocialChannel>
     */
    public function finish(string $state, int $userId, string $pageId, bool $facebook, bool $instagram, bool $isTest): array
    {
        $entry = $this->entryFor($state, $userId);
        $page = collect($entry['pages'] ?? [])->firstWhere('page_id', $pageId);
        if ($page === null) {
            throw new RuntimeException('That Page is not in this connect session.');
        }

        $out = [];
        if ($facebook) {
            $out[] = $this->upsert('facebook', $page['page_id'], $page['name'], [
                'page_id' => $page['page_id'],
                'access_token' => $page['access_token'],
            ], $isTest);
        }
        if ($instagram) {
            if (empty($page['instagram'])) {
                throw new RuntimeException('That Page has no Instagram business account linked to it.');
            }
            $label = $page['instagram']['username'] !== '' ? '@' . $page['instagram']['username'] : $page['name'] . ' (Instagram)';
            $out[] = $this->upsert('instagram', $page['instagram']['ig_user_id'], $label, [
                'ig_user_id' => $page['instagram']['ig_user_id'],
                'access_token' => $page['access_token'],
            ], $isTest);
        }

        Cache::forget($this->stateKey($state));

        return $out;
    }

    /** @param array<string, string> $credentials */
    private function upsert(string $platform, string $remoteId, string $name, array $credentials, bool $isTest): SocialChannel
    {
        $channel = SocialChannel::query()->where('platform', $platform)->where('remote_account_id', $remoteId)->first();
        if ($channel !== null) {
            // Reconnect: new token, and the health check's verdict is stale.
            $channel->forceFill(['credentials' => $credentials, 'is_enabled' => true, 'health' => null])->save();

            return $channel;
        }

        return SocialChannel::create([
            'platform' => $platform,
            'name' => $name,
            'credentials' => $credentials,
            'remote_account_id' => $remoteId,
            'is_enabled' => true,
            'is_test_channel' => $isTest,
        ]);
    }

    /** @return array{user_id: int, pages: ?list<array<string, mixed>>} */
    private function entryFor(string $state, int $userId): array
    {
        $entry = Cache::get($this->stateKey($state));
        if (!is_array($entry) || (int) ($entry['user_id'] ?? 0) !== $userId) {
            throw new RuntimeException('This connect session has expired or belongs to another user. Start again.');
        }
        if (empty($entry['pages'])) {
            throw new RuntimeException('Facebook has not answered yet. Start again from the Channels tab.');
        }

        return $entry;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    private function graphGet(string $path, array $params): array
    {
        try {
            $response = Http::timeout(20)->get('https://graph.facebook.com/' . config('social.graph_version', 'v21.0') . $path, $params);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Could not reach Facebook: ' . $e->getMessage());
        }
        if (!$response->successful() || !is_array($response->json())) {
            $message = (string) ($response->json('error.message') ?? ('HTTP ' . $response->status()));
            throw new RuntimeException('Facebook refused: ' . $message);
        }

        return $response->json();
    }

    private function assertAvailable(): void
    {
        if (!$this->available()) {
            throw new RuntimeException('Connect with Facebook is not set up on this server (SOCIAL_META_APP_ID / SOCIAL_META_APP_SECRET).');
        }
    }

    private function stateKey(string $state): string
    {
        return 'social-meta-connect:' . $state;
    }
}
