<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\Role;
use App\Models\SiteSetting;
use App\Models\User;
use App\Rules\MaldivesPhone;
use Illuminate\Support\Collection;

/**
 * Who a staff or owner alert goes to (owner, 2026-10-10: "each user group
 * settings must be able to control group wise and each staff separately").
 *
 * Every staff and owner alert that is not addressed to one person by its
 * nature (the rostered staff member, the approver chosen at the till) has
 * an audience the owner edits on its row in Admin → Notifications:
 *
 *   groups  roles ("role:manager"), permission holders ("perm:events.manage"),
 *           the shop phone ("business_phone"), the staff on shift ("on_shift",
 *           order alerts) or the catering team ("catering_team": the person
 *           handling the request, else everyone who manages catering);
 *   users   named people, always, on shift or not;
 *   except  people who never get this alert, whatever group they are in;
 *   phones  typed numbers that are not staff (SMS only);
 *   emails  typed addresses that are not staff (email only).
 *
 * Stored as JSON under sms_type_recipients.{type}; a row never edited has the
 * default below. How each person is then reached (SMS, email, Telegram) is
 * their channels (NotificationChannels) and the row's channel switches. The
 * old one-of-five "mode" (owners & managers, owner only, business phone,
 * named staff, typed numbers) is read and converted on the fly until the
 * migration rewrites it.
 *
 * @phpstan-type Audience array{groups: list<string>, users: list<int>, except: list<int>, phones: list<string>, emails: list<string>}
 */
final class AlertAudience
{
    public const GROUP_ON_SHIFT = 'on_shift';

    public const GROUP_BUSINESS_PHONE = 'business_phone';

    public const GROUP_CATERING_TEAM = 'catering_team';

    /** A typed email address as an SmsService address: no text exists for it. */
    public const EMAIL_PREFIX = 'email:';

    /** Permission groups the owner can pick, label per permission. */
    public const PERMISSION_GROUPS = [
        'events.manage' => 'Whoever manages catering',
        'orders.refund' => 'Whoever can approve refunds',
        'reports.view' => 'Whoever can see reports',
        'inventory.manage' => 'Whoever manages stock',
        'complaints.manage' => 'Whoever manages complaints',
        'devices.approve' => 'Whoever can approve a till',
    ];

    /** Plural names for the seeded roles; any other role shows its own name. */
    private const ROLE_LABELS = [
        'owner' => 'Owners',
        'manager' => 'Managers',
        'staff' => 'Staff (cashiers)',
        'kitchen_staff' => 'Kitchen staff',
        'driver' => 'Drivers',
    ];

    private const OWNERS_MANAGERS = ['role:owner', 'role:manager'];

    private const OWNERS = ['role:owner'];

    private const SHOP = [self::GROUP_BUSINESS_PHONE];

    private const ON_SHIFT = [self::GROUP_ON_SHIFT];

    private const CATERING = [self::GROUP_CATERING_TEAM];

    private const REPORTS = ['role:owner', 'perm:reports.view'];

    /**
     * Where each alert goes until the owner says otherwise. An alert not
     * listed decides its recipient in code and has no audience.
     *
     * @var array<string, list<string>>
     */
    public const DEFAULT_GROUPS = [
        // Order alerts: the staff on shift, by their own order-alert settings
        // (People). Extra numbers and the fallback staff are added in code.
        'staff_new_order' => self::ON_SHIFT,
        'staff_order_confirmed' => self::ON_SHIFT,
        'staff_order_ready' => self::ON_SHIFT,
        'staff_order_out_for_delivery' => self::ON_SHIFT,
        'staff_no_staff_found' => self::ON_SHIFT,
        'staff_notification' => self::ON_SHIFT,
        'staff_new_customer' => self::OWNERS_MANAGERS,
        'staff_refund_requested' => ['perm:orders.refund'],
        'staff_low_stock_menu' => self::OWNERS_MANAGERS,
        // Catering: a new request to everyone who manages catering; from then
        // on to the person handling it (everyone until someone does).
        'catering_request_staff' => ['perm:events.manage'],
        'catering_quote_staff' => self::CATERING,
        'catering_confirmed_staff' => self::CATERING,
        'catering_reminder_staff' => self::CATERING,
        'catering_lifecycle_staff' => self::CATERING,
        // Owner alerts
        'owner_daily_refund_summary' => self::OWNERS_MANAGERS,
        'owner_deposit_payout' => self::OWNERS_MANAGERS,
        'owner_shift_left_open' => self::OWNERS_MANAGERS,
        'owner_shift_variance' => self::OWNERS_MANAGERS,
        'owner_shift_float_mismatch' => self::OWNERS_MANAGERS,
        'owner_complaint_received' => self::OWNERS_MANAGERS,
        'owner_complaint_box_received' => self::OWNERS_MANAGERS,
        'owner_complaint_stale' => self::OWNERS_MANAGERS,
        'owner_complaint_digest' => self::OWNERS_MANAGERS,
        'owner_stock_reorder' => self::OWNERS_MANAGERS,
        'owner_stock_expiry' => self::OWNERS_MANAGERS,
        'owner_price_rise' => self::OWNERS_MANAGERS,
        'owner_social_digest' => self::OWNERS_MANAGERS,
        'trade_reconcile_mismatch_owner' => self::OWNERS_MANAGERS,
        'owner_trade_overdue' => self::OWNERS_MANAGERS,
        'owner_trade_unreconciled' => self::OWNERS_MANAGERS,
        'owner_trade_sales_reported' => self::OWNERS_MANAGERS,
        'owner_trade_billing_due' => self::OWNERS_MANAGERS,
        'owner_late_payment' => self::OWNERS_MANAGERS,
        'owner_gst_filing_due' => self::OWNERS_MANAGERS,
        'owner_delivery_delays' => self::SHOP,
        'owner_device_approval' => self::SHOP,
        'owner_signage_devices' => self::SHOP,
        'owner_social_channel' => self::SHOP,
        'owner_social_approval' => self::SHOP,
        'owner_social_comments' => self::SHOP,
        'owner_order_unstarted' => self::SHOP,
        // Owner only: the alert may be about a manager's account.
        'owner_staff_login_locked' => self::OWNERS,
        'owner_ops_alert' => self::OWNERS,
        // Telegram only: owners, and whoever can see reports.
        'owner_day_report' => self::REPORTS,
        'owner_till_void' => self::REPORTS,
        'owner_cash_out' => self::REPORTS,
    ];

    /** The old mode → groups, for rows saved before 2026-10-10. */
    private const LEGACY_MODES = [
        'owners_managers' => self::OWNERS_MANAGERS,
        'owner_only' => self::OWNERS,
        'business_phone' => self::SHOP,
        'staff' => [],
        'custom' => [],
    ];

    public static function configurable(string $type): bool
    {
        return isset(self::DEFAULT_GROUPS[$type]);
    }

    /** @return Audience|null null when the alert decides its recipient in code */
    public static function default(string $type): ?array
    {
        return isset(self::DEFAULT_GROUPS[$type]) ? self::normalize(['groups' => self::DEFAULT_GROUPS[$type]]) : null;
    }

    /**
     * The audience in force: the owner's, else the default.
     *
     * @return Audience|null
     */
    public static function for(string $type): ?array
    {
        $default = self::default($type);
        if ($default === null) {
            return null;
        }
        $saved = self::saved($type);

        return $saved === null || self::isEmpty($saved) ? $default : $saved;
    }

    /** True when the owner changed this alert's audience from the default. */
    public static function isCustom(string $type): bool
    {
        $saved = self::saved($type);

        return $saved !== null && !self::isEmpty($saved) && $saved !== self::default($type);
    }

    /** @return Audience|null what is stored, converted from the old mode when needed */
    public static function saved(string $type): ?array
    {
        $raw = SiteSetting::get(SmsTypeRegistry::RECIPIENTS_SETTING_PREFIX . $type, null);
        $data = is_string($raw) ? json_decode($raw, true) : (is_array($raw) ? $raw : null);
        if (!is_array($data) || $data === []) {
            return null;
        }
        if (isset($data['mode']) && !isset($data['groups'])) {
            $data = self::fromLegacy($data);
        }

        return self::normalize($data);
    }

    /** @param array<string, mixed>|null $audience null = back to the default */
    public static function save(string $type, ?array $audience): void
    {
        $key = SmsTypeRegistry::RECIPIENTS_SETTING_PREFIX . $type;
        SiteSetting::set($key, $audience === null ? '' : json_encode(self::normalize($audience)));
        SiteSetting::bust();
    }

    /**
     * @param array<string, mixed> $legacy {mode, user_ids, phones}
     * @return Audience
     */
    public static function fromLegacy(array $legacy): array
    {
        $mode = (string) ($legacy['mode'] ?? 'owners_managers');

        return self::normalize([
            'groups' => self::LEGACY_MODES[$mode] ?? self::OWNERS_MANAGERS,
            'users' => $mode === 'staff' ? (array) ($legacy['user_ids'] ?? []) : [],
            'phones' => $mode === 'custom' ? (array) ($legacy['phones'] ?? []) : [],
        ]);
    }

    /**
     * Clean shape: known groups only, whole numbers, normalised phones, valid
     * emails, nothing twice, nobody both named and excepted.
     *
     * @param array<string, mixed> $raw
     * @return Audience
     */
    public static function normalize(array $raw): array
    {
        $groups = array_values(array_unique(array_filter(
            array_map(fn ($g) => trim((string) $g), (array) ($raw['groups'] ?? [])),
            fn (string $g) => self::validGroup($g),
        )));
        $except = array_values(array_unique(array_filter(array_map('intval', (array) ($raw['except'] ?? [])), fn (int $id) => $id > 0)));
        $users = array_values(array_unique(array_filter(array_map('intval', (array) ($raw['users'] ?? [])), fn (int $id) => $id > 0 && !in_array($id, $except, true))));
        $phones = [];
        foreach ((array) ($raw['phones'] ?? []) as $p) {
            try {
                $phones[] = MaldivesPhone::normalize(trim((string) $p));
            } catch (\Throwable) {
                // not a Maldivian number: dropped
            }
        }
        $emails = array_values(array_unique(array_filter(
            array_map(fn ($e) => strtolower(trim((string) $e)), (array) ($raw['emails'] ?? [])),
            fn (string $e) => $e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL) !== false,
        )));

        return [
            'groups' => $groups,
            'users' => $users,
            'except' => $except,
            'phones' => array_values(array_unique(array_filter($phones))),
            'emails' => $emails,
        ];
    }

    /** @param Audience $audience */
    public static function isEmpty(array $audience): bool
    {
        return $audience['groups'] === [] && $audience['users'] === [] && $audience['phones'] === [] && $audience['emails'] === [];
    }

    public static function validGroup(string $group): bool
    {
        if (in_array($group, [self::GROUP_ON_SHIFT, self::GROUP_BUSINESS_PHONE, self::GROUP_CATERING_TEAM], true)) {
            return true;
        }
        if (str_starts_with($group, 'perm:')) {
            return isset(self::PERMISSION_GROUPS[substr($group, 5)]);
        }

        return str_starts_with($group, 'role:') && preg_match('/^[a-z0-9_\-]{1,60}$/', substr($group, 5)) === 1;
    }

    public static function isEmailAddress(string $to): bool
    {
        return str_starts_with($to, self::EMAIL_PREFIX);
    }

    public static function emailFrom(string $to): string
    {
        return substr($to, strlen(self::EMAIL_PREFIX));
    }

    /**
     * What makes two addresses the same: a Maldivian number by its seven
     * digits ("7820288", "+960 782 0288" and "+9607820288" are one phone),
     * an email address whatever its case, anything else as written. Staff
     * phones are stored as typed, so the same number can sit on two
     * accounts in two forms (owner, 2026-10-10: one alert came twice).
     */
    public static function addressKey(string $to): string
    {
        $to = trim($to);
        if (self::isEmailAddress($to)) {
            return strtolower($to);
        }
        if (NotificationChannels::isToken($to)) {
            return $to;
        }
        $digits = preg_replace('/\D/', '', $to) ?? '';
        if (strlen($digits) === 7 || (strlen($digits) === 10 && str_starts_with($digits, '960'))) {
            return 'mv:' . substr($digits, -7);
        }

        return $to;
    }

    /**
     * Addresses with each phone, person and email once, first one kept.
     *
     * @param Collection<int, string> $addresses
     * @return Collection<int, string>
     */
    public static function unique(Collection $addresses): Collection
    {
        return $addresses->unique(fn (string $to) => self::addressKey($to))->values();
    }

    /** What a group is called in Admin and in the log. */
    public static function groupLabel(string $group, ?Collection $roleNames = null): string
    {
        if (str_starts_with($group, 'role:')) {
            $slug = substr($group, 5);

            return self::ROLE_LABELS[$slug] ?? (string) (($roleNames ?? Role::query()->pluck('name', 'slug'))[$slug] ?? ucfirst(str_replace('_', ' ', $slug)));
        }
        if (str_starts_with($group, 'perm:')) {
            return self::PERMISSION_GROUPS[substr($group, 5)] ?? substr($group, 5);
        }

        return match ($group) {
            self::GROUP_ON_SHIFT => 'Staff on shift',
            self::GROUP_BUSINESS_PHONE => 'Business phone',
            self::GROUP_CATERING_TEAM => 'The person handling the request',
            default => $group,
        };
    }

    public static function resolver(): AudienceResolver
    {
        return new AudienceResolver;
    }

    /**
     * The people in an alert's audience: everyone in its groups and its named
     * people, minus its exceptions. Active staff only.
     *
     * @param array{handler?: int|null, at?: \Carbon\Carbon|null, skip?: list<string>, except?: list<int>, resolver?: AudienceResolver} $context
     * @return Collection<int, User>
     */
    public static function users(string $type, array $context = []): Collection
    {
        $audience = self::for($type);
        if ($audience === null) {
            return collect();
        }

        return ($context['resolver'] ?? self::resolver())->usersFor($audience, $context);
    }

    /**
     * Where an alert goes, as SmsService addresses: each person's phone (or
     * "user:{id}" when another channel reaches them), the shop phone, typed
     * numbers, and "email:{address}" for typed emails.
     *
     * @param array{handler?: int|null, at?: \Carbon\Carbon|null, skip?: list<string>, except?: list<int>, resolver?: AudienceResolver} $context
     * @return Collection<int, string>
     */
    public static function addresses(string $type, array $context = []): Collection
    {
        $audience = self::for($type);
        if ($audience === null) {
            return collect();
        }
        $skip = $context['skip'] ?? [];
        // A person without a phone is "user:{id}" whatever else reaches them:
        // when nothing does, SmsService logs a failed row naming them, so the
        // gap shows in the log instead of going quiet.
        $out = self::users($type, $context)
            ->map(fn (User $u) => trim((string) $u->phone) !== '' ? trim((string) $u->phone) : NotificationChannels::token($u))
            ->values();
        if (in_array(self::GROUP_BUSINESS_PHONE, $audience['groups'], true) && !in_array(self::GROUP_BUSINESS_PHONE, $skip, true)) {
            $shop = trim((string) SiteSetting::get('business_phone', ''));
            if ($shop !== '') {
                $out->push($shop);
            }
        }
        foreach ($audience['phones'] as $phone) {
            $out->push($phone);
        }
        foreach ($audience['emails'] as $email) {
            $out->push(self::EMAIL_PREFIX . $email);
        }

        // One number typed two ways, or the shop phone that is also a
        // person's phone, is one address: one text.
        return self::unique($out);
    }

    /**
     * For Admin: who gets this alert right now, by name, and the addresses
     * that are not people.
     *
     * @param array{resolver?: AudienceResolver} $context
     * @return array{people: list<array{id: int, name: string, role: string|null, reach: list<string>}>, extras: list<string>, groups: list<string>, note: string|null}
     */
    public static function describe(string $type, array $context = []): array
    {
        $audience = self::for($type);
        if ($audience === null) {
            return ['people' => [], 'extras' => [], 'groups' => [], 'note' => null];
        }
        $resolver = $context['resolver'] ?? self::resolver();
        $people = $resolver->usersFor($audience, ['skip' => [self::GROUP_ON_SHIFT, self::GROUP_CATERING_TEAM]])
            ->map(fn (User $u) => [
                'id' => (int) $u->id,
                'name' => (string) $u->name,
                'role' => $u->role?->name,
                'reach' => $resolver->reach($u),
            ])->values()->all();
        // The catering team without a request to look at: whoever manages catering.
        if (in_array(self::GROUP_CATERING_TEAM, $audience['groups'], true)) {
            foreach ($resolver->groupUsers('perm:events.manage') as $u) {
                if (!in_array((int) $u->id, $audience['except'], true) && !collect($people)->contains('id', (int) $u->id)) {
                    $people[] = ['id' => (int) $u->id, 'name' => (string) $u->name, 'role' => $u->role?->name, 'reach' => $resolver->reach($u)];
                }
            }
        }
        $extras = [];
        if (in_array(self::GROUP_BUSINESS_PHONE, $audience['groups'], true)) {
            $shop = trim((string) SiteSetting::get('business_phone', ''));
            $extras[] = $shop !== '' ? 'Business phone ' . $shop : 'Business phone (not set)';
        }
        array_push($extras, ...$audience['phones'], ...$audience['emails']);
        $notes = [];
        if (in_array(self::GROUP_ON_SHIFT, $audience['groups'], true)) {
            $notes[] = 'the staff on shift when it happens, by their order-alert settings';
        }
        if (in_array(self::GROUP_CATERING_TEAM, $audience['groups'], true)) {
            $notes[] = 'the person handling the request once someone does';
        }
        $roleNames = Role::query()->pluck('name', 'slug');

        return [
            'people' => $people,
            'extras' => $extras,
            'groups' => array_map(fn (string $g) => self::groupLabel($g, $roleNames), $audience['groups']),
            'note' => $notes === [] ? null : ucfirst(implode('; ', $notes)) . '.',
        ];
    }

    /**
     * The groups Admin offers, with how many people each has today.
     *
     * @return list<array{key: string, label: string, count: int|null}>
     */
    public static function groupOptions(?AudienceResolver $resolver = null): array
    {
        $resolver ??= self::resolver();
        $order = ['owner' => 0, 'manager' => 1, 'staff' => 2, 'kitchen_staff' => 3, 'driver' => 4];
        $roles = Role::query()->where('is_active', true)->get(['slug', 'name'])
            ->sortBy(fn (Role $r) => sprintf('%02d-%s', $order[$r->slug] ?? 99, $r->slug))->values();
        $roleNames = $roles->pluck('name', 'slug');
        $out = [];
        foreach ($roles as $role) {
            $out[] = ['key' => 'role:' . $role->slug, 'label' => self::groupLabel('role:' . $role->slug, $roleNames), 'count' => $resolver->groupUsers('role:' . $role->slug)->count()];
        }
        foreach (self::PERMISSION_GROUPS as $slug => $label) {
            $out[] = ['key' => 'perm:' . $slug, 'label' => $label, 'count' => $resolver->groupUsers('perm:' . $slug)->count()];
        }
        $shop = trim((string) SiteSetting::get('business_phone', ''));
        $out[] = ['key' => self::GROUP_BUSINESS_PHONE, 'label' => $shop !== '' ? 'Business phone ' . $shop : 'Business phone (not set)', 'count' => $shop !== '' ? 1 : 0];
        $out[] = ['key' => self::GROUP_ON_SHIFT, 'label' => 'Staff on shift (by their order-alert settings)', 'count' => null];
        $out[] = ['key' => self::GROUP_CATERING_TEAM, 'label' => 'The person handling the request (everyone who manages catering until someone does)', 'count' => null];

        return $out;
    }
}
