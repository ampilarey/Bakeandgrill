<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Domains\Posters\PosterStaleness;
use App\Models\Poster;
use App\Support\OwnerPhones;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Out-of-date posters, and posters that should come down today or tomorrow
 * (docs/POSTER_PLAN.md § 10). Two alerts, each with its own row.
 */
class AlertPosters extends Command
{
    public const STALE = 'owner_poster_stale';

    public const ENDING = 'owner_poster_ending';

    protected $signature = 'posters:alert';

    protected $description = 'Tell the owners about posters that are out of date or due to come down';

    public function handle(SmsService $sms): int
    {
        $this->send($sms, self::STALE, $this->staleLines(), 'poster-stale');
        $this->send($sms, self::ENDING, $this->endingLines(), 'poster-ending');

        return self::SUCCESS;
    }

    /** @return list<string> */
    private function staleLines(): array
    {
        $lines = [];
        $posters = Poster::query()->with('latestReady')->orderByDesc('id')->limit(100)->get();
        foreach ($posters as $poster) {
            $previous = $poster->latestReady;
            if ($previous === null || !is_string($previous->bound_hash) || $previous->bound_hash === '') {
                continue;
            }
            $snapshot = PosterStaleness::snapshot($poster);
            if (PosterStaleness::hash($snapshot) === $previous->bound_hash) {
                continue;
            }
            $diff = PosterStaleness::diff(is_array($previous->snapshot) ? $previous->snapshot : null, $snapshot);
            $lines[] = $poster->code() . ' ' . $poster->name . ($diff !== '' ? ' (' . $diff . ')' : '');
            if (count($lines) >= 4) {
                break;
            }
        }

        return $lines;
    }

    /** @return list<string> */
    private function endingLines(): array
    {
        $today = now()->toDateString();
        $tomorrow = now()->addDay()->toDateString();

        return Poster::query()
            ->whereDate('take_down_on', '>=', $today)
            ->whereDate('take_down_on', '<=', $tomorrow)
            ->where('state', '!=', 'down')
            ->orderBy('take_down_on')
            ->limit(6)
            ->get()
            ->map(fn (Poster $poster) => $poster->code() . ' ' . $poster->name . ' down ' . $poster->take_down_on?->toDateString())
            ->all();
    }

    /** @param list<string> $lines */
    private function send(SmsService $sms, string $type, array $lines, string $key): void
    {
        if ($lines === []) {
            $this->info($type . ': nothing to say.');

            return;
        }
        if (!AlertSwitch::isOn($type)) {
            $this->line($type . ' is off.');

            return;
        }
        $phones = OwnerPhones::for($type);
        if ($phones->isEmpty()) {
            $this->warn($type . ' is on but nobody is set to get it.');

            return;
        }
        $message = 'Bake & Grill posters: ' . implode('; ', $lines) . '. Open Admin → Posters.';
        $date = now()->toDateString();
        foreach ($phones as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: $type,
                    referenceType: 'poster_alert',
                    referenceId: $date,
                    idempotencyKey: $key . ':' . $date . ':' . $phone,
                ));
            } catch (\Throwable $e) {
                Log::error('poster alert failed', ['type' => $type, 'phone' => $phone, 'error' => $e->getMessage()]);
            }
        }
        $this->info($type . ' sent.');
    }
}
