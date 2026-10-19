<?php

declare(strict_types=1);

namespace App\Domains\Shifts\ClockMachine;

use App\Models\ClockDevice;
use App\Models\ClockDevicePunch;
use App\Models\TimePunch;
use App\Models\User;
use App\Services\AuditLogService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Fingerprint and palm clocks on the time clock (owner, 2026-10-19: a ZKTeco P160/ID).
 *
 * The clock sends every punch to `/iclock/cdata` (ZKTeco's ADMS push). Each punch is kept
 * as sent (`clock_device_punches`, once per clock, number and time) and, once its number
 * belongs to a staff member (`users.clock_user_no`), becomes the same time punch the till
 * makes: no open punch means clock in, an open one means clock out. The clock's in / out
 * keys are not trusted; staff rarely press them.
 */
final class ClockMachine
{
    /** A second scan this soon after the first is the same punch. */
    public const DOUBLE_SCAN_MINUTES = 2;

    /** An open punch older than this was never clocked out; the new punch starts a new shift. */
    public const FORGOTTEN_AFTER_HOURS = 16;

    /** Clocks waiting to be allowed, at most (an unknown serial cannot fill the table). */
    public const MAX_WAITING = 10;

    public const SOURCE_NOTE = 'Clock machine';

    public const FORGOT_NOTE = 'No clock-out punch on the clock machine. Fix the hours.';

    /** A staff member's number as the clock writes it: "007" and "7" are one person. */
    public static function normaliseNo(?string $no): ?string
    {
        $no = trim((string) $no);
        if ($no === '' || !preg_match('/^[0-9A-Za-z]{1,20}$/', $no)) {
            return null;
        }
        $trimmed = ltrim($no, '0');

        return $trimmed === '' ? '0' : $trimmed;
    }

    /** The clock knocking: a known clock, or a new one put on the waiting list. */
    public static function deviceFor(string $serial, ?string $ip): ?ClockDevice
    {
        $serial = trim($serial);
        if ($serial === '' || !preg_match('/^[0-9A-Za-z_-]{4,40}$/', $serial)) {
            return null;
        }
        $device = ClockDevice::query()->where('serial', $serial)->first();
        if ($device === null) {
            if (ClockDevice::query()->whereNull('allowed_at')->count() >= self::MAX_WAITING) {
                return null;
            }
            $device = ClockDevice::query()->create(['serial' => $serial]);
        }
        if ($device->last_seen_at === null || $device->last_seen_at->lt(now()->subMinute()) || $device->last_ip !== $ip) {
            $device->forceFill(['last_seen_at' => now(), 'last_ip' => $ip])->save();
        }

        return $device;
    }

    /** The reply to the clock's hello: what to send and how often. Maldives time, UTC+5. */
    public static function options(ClockDevice $device): string
    {
        return implode("\n", [
            'GET OPTION FROM: ' . $device->serial,
            'ATTLOGStamp=' . ($device->att_stamp ?: 'None'),
            'OPERLOGStamp=9999',
            'ATTPHOTOStamp=None',
            'ErrorDelay=60',
            'Delay=30',
            'TransTimes=00:00;14:05',
            'TransInterval=1',
            'TransFlag=TransData AttLog OpLog EnrollUser ChgUser',
            'TimeZone=5',
            'Realtime=1',
            'Encrypt=None',
        ]) . "\n";
    }

    /**
     * Punches the clock sent (table ATTLOG): "number<TAB>2026-10-19 08:01:22<TAB>state<TAB>verify…".
     * Returns how many lines were read; a line already kept is not kept twice.
     */
    public static function receivePunches(ClockDevice $device, string $body, ?string $stamp): int
    {
        $rows = [];
        foreach (preg_split('/\r\n|\r|\n/', $body) ?: [] as $line) {
            $row = self::parseLine($line);
            if ($row !== null) {
                $rows[] = $row;
            }
        }

        $now = now();
        $numbers = array_values(array_unique(array_column($rows, 'no')));
        $owners = $numbers === [] ? collect() : User::query()->whereIn('clock_user_no', $numbers)->pluck('id', 'clock_user_no');
        $insert = [];
        foreach ($rows as $r) {
            $insert[] = [
                'clock_device_id' => $device->id,
                'device_user_no' => $r['no'],
                'punched_at' => $r['at']->format('Y-m-d H:i:s'),
                'state' => $r['state'],
                'verify' => $r['verify'],
                'user_id' => $owners[$r['no']] ?? null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        foreach (array_chunk($insert, 200) as $chunk) {
            ClockDevicePunch::query()->insertOrIgnore($chunk);
        }

        if ($stamp !== null && $stamp !== '' && preg_match('/^[0-9A-Za-z]{1,40}$/', $stamp)) {
            $device->forceFill(['att_stamp' => $stamp])->save();
        }

        self::applyWaiting($device);

        return count($rows);
    }

    /**
     * The clock's own records (table OPERLOG): we keep only who is enrolled, by number and
     * name, so Admin can say who "No. 3" is when matching numbers to staff.
     */
    public static function receiveOperations(ClockDevice $device, string $body): void
    {
        $users = (array) ($device->device_users ?? []);
        $changed = false;
        foreach (preg_split('/\r\n|\r|\n/', $body) ?: [] as $line) {
            if (!str_starts_with($line, 'USER ')) {
                continue;
            }
            $fields = [];
            foreach (explode("\t", substr($line, 5)) as $pair) {
                [$k, $v] = array_pad(explode('=', $pair, 2), 2, '');
                $fields[trim($k)] = trim($v);
            }
            $no = self::normaliseNo($fields['PIN'] ?? null);
            if ($no === null) {
                continue;
            }
            $name = mb_substr(trim((string) ($fields['Name'] ?? '')), 0, 60);
            if (($users[$no] ?? null) !== $name) {
                $users[$no] = $name;
                $changed = true;
            }
        }
        if ($changed) {
            ksort($users, SORT_NATURAL);
            $device->forceFill(['device_users' => $users])->save();
        }
    }

    /** Give a clock number to a staff member (or take it away) and work out what they punched. */
    public static function assign(User $user, ?string $no): void
    {
        $no = self::normaliseNo($no);
        DB::transaction(function () use ($user, $no): void {
            $user->forceFill(['clock_user_no' => $no])->save();
            if ($no !== null) {
                ClockDevicePunch::query()
                    ->where('device_user_no', $no)
                    ->whereNull('user_id')
                    ->update(['user_id' => $user->id]);
            }
        });
        if ($no !== null) {
            foreach (ClockDevice::query()->whereNotNull('allowed_at')->get() as $device) {
                self::applyWaiting($device);
            }
        }
    }

    /** Every kept punch with an owner and no result yet, in the order they happened. */
    public static function applyWaiting(ClockDevice $device): void
    {
        if (!$device->isAllowed()) {
            return;
        }
        ClockDevicePunch::query()
            ->where('clock_device_id', $device->id)
            ->whereNotNull('user_id')
            ->whereNull('result')
            ->orderBy('punched_at')
            ->orderBy('id')
            ->get()
            ->each(fn (ClockDevicePunch $p) => self::apply($p, $device));
    }

    /** One punch onto the time clock. */
    public static function apply(ClockDevicePunch $p, ClockDevice $device): void
    {
        // Punches stored on the clock before it was allowed stay as history only.
        if ($p->punched_at->lt($device->allowed_at->copy()->startOfDay())) {
            $p->forceFill(['result' => 'early'])->save();

            return;
        }

        $logged = DB::transaction(function () use ($p): ?array {
            $at = CarbonImmutable::parse($p->punched_at);
            $open = TimePunch::query()
                ->where('user_id', $p->user_id)
                ->whereNull('clocked_out_at')
                ->latest('clocked_in_at')
                ->lockForUpdate()
                ->first();

            if ($open !== null) {
                $since = $open->clocked_in_at->diffInMinutes($at, false);
                if ($since < self::DOUBLE_SCAN_MINUTES) {
                    $p->forceFill(['result' => 'double', 'time_punch_id' => $open->id])->save();

                    return null;
                }
                if ($since <= self::FORGOTTEN_AFTER_HOURS * 60) {
                    $open->clocked_out_at = $at;
                    $open->total_hours = $open->calculateHours();
                    $open->save();
                    $p->forceFill(['result' => 'out', 'time_punch_id' => $open->id])->save();

                    return ['time_punch.clock_out', $open, ['clocked_out_at' => $open->clocked_out_at, 'total_hours' => $open->total_hours]];
                }
                // Never clocked out: close it with no hours and say so, then start this shift.
                $open->clocked_out_at = $open->clocked_in_at;
                $open->total_hours = 0;
                $open->notes = self::FORGOT_NOTE;
                $open->save();
            } else {
                $last = TimePunch::query()
                    ->where('user_id', $p->user_id)
                    ->whereNotNull('clocked_out_at')
                    ->latest('clocked_out_at')
                    ->first();
                if ($last !== null && $last->clocked_out_at->diffInMinutes($at, false) < self::DOUBLE_SCAN_MINUTES) {
                    $p->forceFill(['result' => 'double', 'time_punch_id' => $last->id])->save();

                    return null;
                }
            }

            $punch = TimePunch::query()->create([
                'user_id' => $p->user_id,
                'clocked_in_at' => $at,
                'notes' => self::SOURCE_NOTE,
            ]);
            $p->forceFill(['result' => 'in', 'time_punch_id' => $punch->id])->save();

            return ['time_punch.clock_in', $punch, ['clocked_in_at' => $punch->clocked_in_at]];
        });

        if ($logged !== null) {
            [$action, $punch, $values] = $logged;
            app(AuditLogService::class)->log($action, 'TimePunch', $punch->id, [], $values, [
                'user_id' => $p->user_id,
                'source' => 'clock_machine',
                'clock_device_id' => $p->clock_device_id,
            ]);
        }
    }

    /**
     * Numbers the clocks sent that belong to nobody yet, newest first, with the name the
     * clock knows them by.
     *
     * @return Collection<int, array{no: string, punches: int, last_at: string, name: ?string}>
     */
    public static function unmatched(): Collection
    {
        $names = [];
        foreach (ClockDevice::query()->get(['device_users']) as $d) {
            foreach ((array) ($d->device_users ?? []) as $no => $name) {
                if ($name !== '') {
                    $names[(string) $no] = $name;
                }
            }
        }

        return ClockDevicePunch::query()
            ->whereNull('user_id')
            ->selectRaw('device_user_no, COUNT(*) as punches, MAX(punched_at) as last_at')
            ->groupBy('device_user_no')
            ->orderByDesc('last_at')
            ->limit(100)
            ->get()
            ->map(fn ($r) => [
                'no' => (string) $r->device_user_no,
                'punches' => (int) $r->punches,
                'last_at' => CarbonImmutable::parse($r->last_at)->toIso8601String(),
                'name' => $names[(string) $r->device_user_no] ?? null,
            ]);
    }

    /** @return array{no: string, at: CarbonImmutable, state: ?int, verify: ?int}|null */
    private static function parseLine(string $line): ?array
    {
        $line = trim($line);
        if ($line === '') {
            return null;
        }
        $parts = explode("\t", $line);
        if (count($parts) < 2 && preg_match('/^(\S+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*(.*)$/', $line, $m)) {
            $parts = array_merge([$m[1], $m[2]], preg_split('/\s+/', trim($m[3])) ?: []);
        }
        $no = self::normaliseNo($parts[0] ?? null);
        $time = trim((string) ($parts[1] ?? ''));
        if ($no === null || !preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $time)) {
            return null;
        }
        try {
            // The clock keeps Maldives time, as the app does (config app.timezone).
            $at = CarbonImmutable::createFromFormat('Y-m-d H:i:s', $time, config('app.timezone'));
        } catch (\Throwable) {
            return null;
        }
        if ($at === null || $at->gt(now()->addDay()) || $at->lt(now()->subYears(2))) {
            return null;
        }
        $num = static fn ($v): ?int => is_numeric(trim((string) $v)) ? (int) trim((string) $v) : null;

        return ['no' => $no, 'at' => $at, 'state' => $num($parts[2] ?? null), 'verify' => $num($parts[3] ?? null)];
    }
}
