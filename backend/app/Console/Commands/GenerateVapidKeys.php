<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;

class GenerateVapidKeys extends Command
{
    protected $signature   = 'push:generate-vapid';
    protected $description = 'Generate VAPID public/private key pair for Web Push notifications';

    public function handle(): int
    {
        $keys = VAPID::createVapidKeys();

        $this->info('VAPID keys generated. Add these to your .env file:');
        $this->line('');
        $this->line('VAPID_PUBLIC_KEY=' . $keys['publicKey']);
        $this->line('VAPID_PRIVATE_KEY=' . $keys['privateKey']);
        $this->line('VAPID_SUBJECT=' . config('app.url'));
        $this->line('');
        $this->comment('Also set VITE_VAPID_PUBLIC_KEY=' . $keys['publicKey'] . ' in your online-order-web .env');

        return Command::SUCCESS;
    }
}
