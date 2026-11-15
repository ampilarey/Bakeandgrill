<?php

declare(strict_types=1);

namespace App\Domains\Inventory\Bills;

use App\Models\SiteSetting;
use Illuminate\Support\Facades\Crypt;
use Throwable;

/**
 * Which service reads supplier bills, and its key (owner, 2026-11-15: "add api key
 * entry to admin so I can switch between Claude, Google etc. if I want").
 *
 * Set on Purchasing → Settings → Reading bills. A key typed there is kept encrypted
 * under the scope `secret`, which the site settings list never returns, and is never
 * sent back to a screen: only its last four characters. A key in .env still works
 * and is used when none is typed. A new service is a row in PROVIDERS and a reader
 * class that BillVision::read() hands the bill to.
 */
class BillReaderSettings
{
    public const PROVIDERS = [
        'claude' => [
            'label' => 'Claude (Anthropic)',
            'model' => 'claude-opus-5-5',
            'env' => 'services.anthropic.key',
            'where' => 'console.anthropic.com → API keys',
        ],
        'google' => [
            'label' => 'Google Gemini',
            'model' => 'gemini-flash-latest',
            'env' => 'services.gemini.key',
            'where' => 'aistudio.google.com → Get API key',
        ],
    ];

    private const SCOPE = 'secret';

    /**
     * The names a supplier may write a bill out to (owner, 2026-11-15: "Akuru is main
     * company. Bake and Grill is under Akuru"): the reader is told these are us, so a
     * bill addressed to the parent company is not pointed out as someone else's.
     */
    public const OUR_NAMES = 'Bake & Grill, Akuru Institute';

    public function provider(): string
    {
        $picked = (string) SiteSetting::get('bill_reader_provider', '');
        if (isset(self::PROVIDERS[$picked])) {
            return $picked;
        }
        // Nothing picked: whichever has a key, Claude first.
        foreach (array_keys(self::PROVIDERS) as $p) {
            if ($this->key($p) !== '') {
                return $p;
            }
        }

        return 'claude';
    }

    public function setProvider(string $provider): void
    {
        SiteSetting::set('bill_reader_provider', $provider);
    }

    /** The key to use: the one typed in Admin, else the one in .env. */
    public function key(string $provider): string
    {
        $typed = $this->typedKey($provider);

        return $typed !== '' ? $typed : trim((string) config(self::PROVIDERS[$provider]['env'] ?? ''));
    }

    public function typedKey(string $provider): string
    {
        $stored = (string) SiteSetting::getScoped("bill_reader_key_{$provider}", self::SCOPE);
        if ($stored === '') {
            return '';
        }
        try {
            return trim(Crypt::decryptString($stored));
        } catch (Throwable) {
            // Encrypted under another APP_KEY (a copied database): as good as not set.
            return '';
        }
    }

    /** An empty key removes the typed one, so the .env key (if any) is used again. */
    public function setKey(string $provider, string $key): void
    {
        $key = trim($key);
        SiteSetting::set("bill_reader_key_{$provider}", $key === '' ? '' : Crypt::encryptString($key), self::SCOPE);
    }

    public function model(string $provider): string
    {
        $typed = trim((string) SiteSetting::get("bill_reader_model_{$provider}", ''));
        if ($typed !== '') {
            return $typed;
        }
        if ($provider === 'claude') {
            return (string) config('services.anthropic.bill_model', self::PROVIDERS['claude']['model']);
        }

        return self::PROVIDERS[$provider]['model'];
    }

    public function setModel(string $provider, string $model): void
    {
        SiteSetting::set("bill_reader_model_{$provider}", trim($model));
    }

    /** @return list<string> */
    public function ourNames(): array
    {
        $typed = trim((string) SiteSetting::get('bill_reader_our_names', ''));
        $names = array_values(array_filter(array_map('trim', explode(',', $typed !== '' ? $typed : self::OUR_NAMES))));

        return $names === [] ? array_map('trim', explode(',', self::OUR_NAMES)) : $names;
    }

    public function setOurNames(string $names): void
    {
        SiteSetting::set('bill_reader_our_names', mb_substr(trim($names), 0, 300));
    }

    /**
     * For the settings screen. Never the key itself.
     *
     * @return array<string, mixed>
     */
    public function present(): array
    {
        $rows = [];
        foreach (self::PROVIDERS as $key => $p) {
            $typed = $this->typedKey($key);
            $inUse = $this->key($key);
            $rows[] = [
                'key' => $key,
                'label' => $p['label'],
                'where' => $p['where'],
                'has_key' => $inUse !== '',
                'key_hint' => $inUse === '' ? null : '…' . mb_substr($inUse, -4),
                'key_from' => $typed !== '' ? 'admin' : ($inUse !== '' ? 'env' : null),
                'model' => $this->model($key),
                'default_model' => $p['model'],
            ];
        }

        return ['provider' => $this->provider(), 'providers' => $rows, 'our_names' => implode(', ', $this->ourNames())];
    }
}
