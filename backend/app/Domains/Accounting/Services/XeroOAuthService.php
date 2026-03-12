<?php

declare(strict_types=1);

namespace App\Domains\Accounting\Services;

use App\Models\XeroConnection;
use Illuminate\Support\Facades\Http;

class XeroOAuthService
{
    private const AUTHORIZE_URL  = 'https://login.xero.com/identity/connect/authorize';
    private const TOKEN_URL      = 'https://identity.xero.com/connect/token';
    private const CONNECTIONS_URL = 'https://api.xero.com/connections';
    private const SCOPES = 'openid profile email accounting.transactions accounting.settings offline_access';

    public function getAuthorizationUrl(string $state): string
    {
        $params = http_build_query([
            'response_type' => 'code',
            'client_id'     => config('services.xero.client_id'),
            'redirect_uri'  => config('services.xero.redirect_uri'),
            'scope'         => self::SCOPES,
            'state'         => $state,
        ]);

        return self::AUTHORIZE_URL . '?' . $params;
    }

    public function exchangeCode(string $code): XeroConnection
    {
        $response = Http::asForm()->withBasicAuth(
            config('services.xero.client_id'),
            config('services.xero.client_secret'),
        )->post(self::TOKEN_URL, [
            'grant_type'   => 'authorization_code',
            'code'         => $code,
            'redirect_uri' => config('services.xero.redirect_uri'),
        ]);

        if ($response->failed()) {
            throw new \RuntimeException('Xero token exchange failed: ' . $response->body());
        }

        $tokens = $response->json();

        // Get the active tenant
        $connections = Http::withToken($tokens['access_token'])
            ->get(self::CONNECTIONS_URL)
            ->json();

        $tenant = $connections[0] ?? null;
        if (!$tenant) {
            throw new \RuntimeException('No Xero organisation found for this connection.');
        }

        return XeroConnection::updateOrCreate(
            ['tenant_id' => $tenant['tenantId']],
            [
                'tenant_name'      => $tenant['tenantName'],
                'access_token'     => $tokens['access_token'],
                'refresh_token'    => $tokens['refresh_token'],
                'token_expires_at' => now()->addSeconds((int) $tokens['expires_in']),
                'connected_at'     => now(),
                'active'           => true,
            ]
        );
    }

    public function refreshToken(XeroConnection $connection): XeroConnection
    {
        $response = Http::asForm()->withBasicAuth(
            config('services.xero.client_id'),
            config('services.xero.client_secret'),
        )->post(self::TOKEN_URL, [
            'grant_type'    => 'refresh_token',
            'refresh_token' => $connection->refresh_token,
        ]);

        if ($response->failed()) {
            $connection->update(['active' => false]);
            throw new \RuntimeException('Xero token refresh failed. Re-authentication required.');
        }

        $tokens = $response->json();

        $connection->update([
            'access_token'     => $tokens['access_token'],
            'refresh_token'    => $tokens['refresh_token'] ?? $connection->refresh_token,
            'token_expires_at' => now()->addSeconds((int) $tokens['expires_in']),
        ]);

        return $connection->refresh();
    }

    public function getActiveConnection(): ?XeroConnection
    {
        return XeroConnection::where('active', true)->latest()->first();
    }

    public function getFreshToken(): string
    {
        $conn = $this->getActiveConnection();
        if (!$conn) {
            throw new \RuntimeException('Xero is not connected. Authorize first at /api/xero/connect.');
        }

        if ($conn->isExpired()) {
            $conn = $this->refreshToken($conn);
        }

        return $conn->access_token;
    }
}
