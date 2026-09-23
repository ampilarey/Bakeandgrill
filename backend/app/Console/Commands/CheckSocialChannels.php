<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Social\Drivers\ChannelHealth;
use App\Domains\Social\Services\SocialChannelHealthChecker;
use App\Models\SocialChannel;
use Illuminate\Console\Command;

/**
 * Daily: does every enabled social channel still reach its account, and
 * when does its token expire? Stores the answer on the channel (the
 * Channels tab shows it) and SMSes the business phone once per problem.
 */
class CheckSocialChannels extends Command
{
    protected $signature = 'social:check-channels';

    protected $description = 'Check every enabled social channel: credentials still work, token expiry, one SMS per new problem';

    public function handle(SocialChannelHealthChecker $checker): int
    {
        $results = $checker->checkAllEnabled();
        if ($results === []) {
            $this->info('No enabled social channels.');

            return self::SUCCESS;
        }

        foreach ($results as $id => $health) {
            $channel = SocialChannel::find($id);
            $name = $channel ? "{$channel->platform} \"{$channel->name}\"" : "#{$id}";
            $line = "{$name}: {$health->status} — {$health->message}";
            $health->status === ChannelHealth::ERROR ? $this->error($line) : $this->line($line);
        }

        return self::SUCCESS;
    }
}
