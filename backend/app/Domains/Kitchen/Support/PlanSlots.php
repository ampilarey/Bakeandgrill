<?php

declare(strict_types=1);

namespace App\Domains\Kitchen\Support;

use App\Models\SiteSetting;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Validation\ValidationException;

/**
 * The time slots a trading day is planned in, and the rest of the plan's
 * settings.
 *
 * "Friday evening" is the unit the owner thinks in, so the plan works in
 * named slots rather than hours. A slot may run over midnight (Night,
 * 22:00–06:00); the hours after midnight belong to the day that opened,
 * so a 01:00 sale on Saturday counts as Friday night. The business day
 * starts at the earliest slot start.
 */
final class PlanSlots
{
    public const SETTING_KEY = 'production_plan_settings_json';

    public const MAX_SLOTS = 8;

    /** @var list<array{label: string, from: int, to: int}> */
    public const DEFAULT_SLOTS = [
        ['label' => 'Morning', 'from' => 6, 'to' => 11],
        ['label' => 'Midday', 'from' => 11, 'to' => 15],
        ['label' => 'Afternoon', 'from' => 15, 'to' => 18],
        ['label' => 'Evening', 'from' => 18, 'to' => 22],
        ['label' => 'Night', 'from' => 22, 'to' => 6],
    ];

    public const DEFAULTS = [
        'lookback_weeks' => 12,
        'sample_weeks' => 8,
        'default_service_level_pct' => 85,
    ];

    /** @param list<array{key: string, label: string, from: int, to: int}> $slots */
    private function __construct(private readonly array $slots) {}

    /**
     * The saved settings with every gap filled from the defaults.
     *
     * @return array{slots: list<array{label: string, from: int, to: int}>, lookback_weeks: int, sample_weeks: int, default_service_level_pct: int}
     */
    public static function load(): array
    {
        $raw = SiteSetting::get(self::SETTING_KEY);
        $decoded = is_string($raw) ? json_decode($raw, true) : (is_array($raw) ? $raw : null);
        $saved = is_array($decoded) ? $decoded : [];

        $slots = self::DEFAULT_SLOTS;
        if (isset($saved['slots']) && is_array($saved['slots']) && $saved['slots'] !== []) {
            try {
                $slots = self::cleanSlots($saved['slots']);
            } catch (ValidationException) {
                // A setting hand-edited into nonsense must not take the plan
                // down with it; the defaults still describe a day.
            }
        }

        return [
            'slots' => $slots,
            'lookback_weeks' => self::clampInt($saved['lookback_weeks'] ?? null, 4, 52, self::DEFAULTS['lookback_weeks']),
            'sample_weeks' => self::clampInt($saved['sample_weeks'] ?? null, 3, 26, self::DEFAULTS['sample_weeks']),
            'default_service_level_pct' => self::clampInt($saved['default_service_level_pct'] ?? null, 50, 99, self::DEFAULTS['default_service_level_pct']),
        ];
    }

    /**
     * Validate and persist. Returns what is now saved.
     *
     * @param array<string, mixed> $input
     * @return array{slots: list<array{label: string, from: int, to: int}>, lookback_weeks: int, sample_weeks: int, default_service_level_pct: int}
     */
    public static function save(array $input): array
    {
        $current = self::load();
        $clean = [
            'slots' => array_key_exists('slots', $input) ? self::cleanSlots($input['slots']) : $current['slots'],
            'lookback_weeks' => self::requireInt($input, 'lookback_weeks', 4, 52, $current['lookback_weeks']),
            'sample_weeks' => self::requireInt($input, 'sample_weeks', 3, 26, $current['sample_weeks']),
            'default_service_level_pct' => self::requireInt($input, 'default_service_level_pct', 50, 99, $current['default_service_level_pct']),
        ];
        if ($clean['sample_weeks'] > $clean['lookback_weeks']) {
            throw ValidationException::withMessages([
                'sample_weeks' => ['The plan cannot sample more weeks than it looks back over.'],
            ]);
        }

        SiteSetting::set(self::SETTING_KEY, json_encode($clean, JSON_THROW_ON_ERROR));

        return self::load();
    }

    /** @param array{slots?: list<array{label: string, from: int, to: int}>}|null $settings */
    public static function fromSettings(?array $settings = null): self
    {
        $settings ??= self::load();
        $slots = [];
        foreach ($settings['slots'] as $slot) {
            $slots[] = [
                'key' => (string) $slot['from'],
                'label' => $slot['label'],
                'from' => (int) $slot['from'],
                'to' => (int) $slot['to'],
            ];
        }

        return new self($slots);
    }

    /** @return list<array{key: string, label: string, from: int, to: int}> */
    public function all(): array
    {
        return $this->slots;
    }

    /** @return array{key: string, label: string, from: int, to: int}|null */
    public function byKey(string $key): ?array
    {
        foreach ($this->slots as $slot) {
            if ($slot['key'] === $key) {
                return $slot;
            }
        }

        return null;
    }

    /** The hour the trading day starts: the earliest slot start. */
    public function dayStartHour(): int
    {
        return min(array_column($this->slots, 'from'));
    }

    /** @return array{key: string, label: string, from: int, to: int}|null */
    public function forHour(int $hour): ?array
    {
        foreach ($this->slots as $slot) {
            if (self::covers($slot, $hour)) {
                return $slot;
            }
        }

        return null;
    }

    public function keyForHour(int $hour): ?string
    {
        return $this->forHour($hour)['key'] ?? null;
    }

    /** The trading day a moment belongs to (small hours go to the day before). */
    public function businessDate(CarbonInterface $at): string
    {
        return $at->hour < $this->dayStartHour()
            ? $at->copy()->subDay()->toDateString()
            : $at->toDateString();
    }

    /**
     * When a slot opens and closes on a given trading day.
     *
     * @param array{from: int, to: int} $slot
     * @return array{0: Carbon, 1: Carbon}
     */
    public function window(string $date, array $slot): array
    {
        $start = Carbon::parse($date, config('app.timezone'))->setTime($slot['from'], 0);
        $end = Carbon::parse($date, config('app.timezone'))->setTime($slot['to'], 0);
        if ($slot['to'] <= $slot['from']) {
            $end->addDay();
        }

        return [$start, $end];
    }

    /** @param array{from: int, to: int} $slot */
    private static function covers(array $slot, int $hour): bool
    {
        if ($slot['from'] < $slot['to']) {
            return $hour >= $slot['from'] && $hour < $slot['to'];
        }

        // Runs over midnight.
        return $hour >= $slot['from'] || $hour < $slot['to'];
    }

    /**
     * @return list<array{label: string, from: int, to: int}>
     */
    private static function cleanSlots(mixed $input): array
    {
        if (!is_array($input) || $input === [] || count($input) > self::MAX_SLOTS) {
            throw ValidationException::withMessages([
                'slots' => ['Give between one and ' . self::MAX_SLOTS . ' time slots.'],
            ]);
        }

        $slots = [];
        $covered = [];
        foreach (array_values($input) as $i => $slot) {
            $n = $i + 1;
            $label = is_array($slot) ? trim((string) ($slot['label'] ?? '')) : '';
            $from = is_array($slot) && is_numeric($slot['from'] ?? null) ? (int) $slot['from'] : -1;
            $to = is_array($slot) && is_numeric($slot['to'] ?? null) ? (int) $slot['to'] : -1;

            if ($label === '' || mb_strlen($label) > 40) {
                throw ValidationException::withMessages(["slots.{$i}.label" => ["Slot {$n} needs a name of up to 40 characters."]]);
            }
            if ($from < 0 || $from > 23 || $to < 0 || $to > 23) {
                throw ValidationException::withMessages(["slots.{$i}.from" => ["Slot {$n}: hours run from 0 to 23."]]);
            }
            if ($from === $to) {
                throw ValidationException::withMessages(["slots.{$i}.to" => ["Slot {$n} cannot start and end at the same hour."]]);
            }

            $slots[] = ['label' => $label, 'from' => $from, 'to' => $to];
            for ($h = 0; $h < 24; $h++) {
                if (self::covers(['from' => $from, 'to' => $to], $h)) {
                    if (isset($covered[$h])) {
                        throw ValidationException::withMessages([
                            "slots.{$i}.from" => [sprintf('Slot %d overlaps "%s" at %02d:00.', $n, $covered[$h], $h)],
                        ]);
                    }
                    $covered[$h] = $label;
                }
            }
        }

        // Every hour must belong somewhere, or a sale at that hour would
        // silently drop out of the plan.
        for ($h = 0; $h < 24; $h++) {
            if (!isset($covered[$h])) {
                throw ValidationException::withMessages([
                    'slots' => [sprintf('No slot covers %02d:00. Slots must account for all 24 hours.', $h)],
                ]);
            }
        }

        usort($slots, fn (array $a, array $b) => $a['from'] <=> $b['from']);

        // Start the list at the trading day's first slot: a slot that runs
        // over midnight (22–06) sorts last, not first.
        $firstDayIdx = 0;
        foreach ($slots as $i => $slot) {
            if ($slot['from'] < $slot['to']) {
                $firstDayIdx = $i;
                break;
            }
        }

        return array_values(array_merge(array_slice($slots, $firstDayIdx), array_slice($slots, 0, $firstDayIdx)));
    }

    private static function clampInt(mixed $value, int $min, int $max, int $default): int
    {
        if (!is_numeric($value)) {
            return $default;
        }

        return max($min, min($max, (int) $value));
    }

    /** @param array<string, mixed> $input */
    private static function requireInt(array $input, string $key, int $min, int $max, int $current): int
    {
        if (!array_key_exists($key, $input)) {
            return $current;
        }
        $value = $input[$key];
        if (!is_numeric($value) || (int) $value < $min || (int) $value > $max) {
            throw ValidationException::withMessages([
                $key => [sprintf('%s must be a whole number between %d and %d.', str_replace('_', ' ', ucfirst($key)), $min, $max)],
            ]);
        }

        return (int) $value;
    }
}
