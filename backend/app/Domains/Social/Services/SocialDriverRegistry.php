<?php

declare(strict_types=1);

namespace App\Domains\Social\Services;

use App\Domains\Social\Drivers\FacebookPageDriver;
use App\Domains\Social\Drivers\InstagramDriver;
use App\Domains\Social\Drivers\SocialDriverInterface;
use App\Domains\Social\Drivers\TelegramDriver;
use App\Domains\Social\Drivers\ViberChannelDriver;
use InvalidArgumentException;

/**
 * Platform → driver. Adding a platform means adding a driver class here —
 * nothing else in the pipeline changes (plan §2b).
 */
class SocialDriverRegistry
{
    /** @return array<string, class-string<SocialDriverInterface>> */
    public function map(): array
    {
        return [
            'facebook' => FacebookPageDriver::class,
            'instagram' => InstagramDriver::class,
            'telegram' => TelegramDriver::class,
            'viber' => ViberChannelDriver::class,
        ];
    }

    public function for(string $platform): SocialDriverInterface
    {
        $class = $this->map()[$platform] ?? null;
        if ($class === null) {
            throw new InvalidArgumentException("No social driver for platform [{$platform}].");
        }

        return app($class);
    }

    /**
     * @return array<string, array{text: bool, photo: bool, requires_photo: bool, credentials: list<string>}>
     */
    public function capabilities(): array
    {
        $out = [];
        foreach (array_keys($this->map()) as $platform) {
            $driver = $this->for($platform);
            $out[$platform] = $driver->capabilities() + ['credentials' => $driver->requiredCredentials()];
        }

        return $out;
    }
}
