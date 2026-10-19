<?php

declare(strict_types=1);

namespace App\Domains\Customers\Support;

use App\Domains\Notifications\Support\SmsTypeRegistry;
use App\Models\Customer;

/**
 * What a customer wants to hear, and how (iruali import plan, feature 5).
 *
 * Four kinds, each by SMS, email, both or neither:
 *   - orders: confirmed, being made, ready, paid, receipt. Both by default.
 *   - delivery: on the way, delivered. SMS by default.
 *   - offers: campaigns, birthday and milestone offers, abandoned cart. By SMS
 *     unless the customer said stop (customers.sms_opt_out, the switch the STOP
 *     reply and the SMS page already use); by email only when they asked for
 *     it and their email is checked.
 *   - security: sign-in and email codes. Always both; cannot be turned off.
 *
 * A message belongs to a kind by its row in the notification registry
 * (kindOf). A row with no kind (refunds, complaints, credit, catering,
 * reservations, wholesale, anything sent at the customer's request at the
 * till) follows the shop's switch alone. The shop's switches on System →
 * Notifications stay the first word: a customer's choice only narrows them.
 */
final class MessageChoices
{
    public const ORDERS = 'orders';

    public const DELIVERY = 'delivery';

    public const OFFERS = 'offers';

    public const SECURITY = 'security';

    public const KINDS = [self::ORDERS, self::DELIVERY, self::OFFERS, self::SECURITY];

    public const SMS = 'sms';

    public const EMAIL = 'email';

    private const ORDER_TYPES = [
        'customer_order_confirmed', 'customer_order_preparing', 'customer_order_ready',
        'customer_payment_confirmed_pos', 'customer_payment_confirmed_online', 'customer_completion_receipt', 'customer_review_reply', 'customer_order_message_reply',
    ];

    private const DELIVERY_TYPES = ['customer_order_on_the_way', 'customer_order_delivered'];

    /** @var array<string, array{sms: bool, email: bool}> */
    private const DEFAULTS = [
        self::ORDERS => ['sms' => true, 'email' => true],
        self::DELIVERY => ['sms' => true, 'email' => false],
    ];

    /** The kind a registry row's message belongs to, or null when the customer has no say. */
    public static function kindOf(string $type): ?string
    {
        if (in_array($type, self::ORDER_TYPES, true)) {
            return self::ORDERS;
        }
        if (in_array($type, self::DELIVERY_TYPES, true)) {
            return self::DELIVERY;
        }
        $entry = SmsTypeRegistry::resolve($type);

        return match ($entry['category'] ?? '') {
            // A campaign is sent by staff but is still an offer.
            'marketing' => self::OFFERS,
            'auth' => self::SECURITY,
            default => null,
        };
    }

    /** May a message of this kind reach this customer by this channel? */
    public static function allows(?Customer $customer, ?string $kind, string $channel): bool
    {
        if ($customer === null || $kind === null || $kind === self::SECURITY) {
            return true;
        }
        if ($kind === self::OFFERS) {
            return $channel === self::SMS
                ? !$customer->sms_opt_out
                : (bool) (self::stored($customer)[self::OFFERS]['email'] ?? false) && $customer->hasVerifiedEmail();
        }

        return (bool) (self::stored($customer)[$kind][$channel] ?? self::DEFAULTS[$kind][$channel] ?? true);
    }

    /**
     * What the customer sees on Account → Messages.
     *
     * @return array<string, array{sms: bool, email: bool, locked: bool}>
     */
    public static function for(Customer $customer): array
    {
        $out = [];
        foreach (self::KINDS as $kind) {
            $out[$kind] = [
                'sms' => self::allows($customer, $kind, self::SMS),
                'email' => $kind === self::OFFERS
                    ? (bool) (self::stored($customer)[self::OFFERS]['email'] ?? false)
                    : self::allows($customer, $kind, self::EMAIL),
                'locked' => $kind === self::SECURITY,
            ];
        }

        return $out;
    }

    /**
     * Keep the customer's choices. Offers by SMS is the customer's SMS
     * opt-out, so it is written there; security cannot be changed.
     *
     * @param array<string, mixed> $input kind => {sms?: bool, email?: bool}
     */
    public static function update(Customer $customer, array $input): void
    {
        $stored = self::stored($customer);
        foreach ([self::ORDERS, self::DELIVERY, self::OFFERS] as $kind) {
            $row = $input[$kind] ?? null;
            if (!is_array($row)) {
                continue;
            }
            foreach ([self::SMS, self::EMAIL] as $channel) {
                if (!array_key_exists($channel, $row)) {
                    continue;
                }
                $on = (bool) $row[$channel];
                if ($kind === self::OFFERS && $channel === self::SMS) {
                    if ($on === (bool) $customer->sms_opt_out) {
                        $customer->forceFill([
                            'sms_opt_out' => !$on,
                            'sms_opt_out_at' => $on ? null : now(),
                            'sms_opt_out_source' => 'order_app',
                        ]);
                    }

                    continue;
                }
                $stored[$kind][$channel] = $on;
            }
        }
        $customer->forceFill(['message_prefs' => $stored])->save();
    }

    /**
     * Stop offer emails. SMS offers stay unless $sms is set — a "stop emails"
     * link must not also silence order texts' sibling, the SMS promo switch.
     */
    public static function stopOffers(Customer $customer, string $source, bool $sms = false): void
    {
        $stored = self::stored($customer);
        $stored[self::OFFERS]['email'] = false;
        $customer->forceFill(['message_prefs' => $stored]);
        if ($sms && !$customer->sms_opt_out) {
            $customer->forceFill(['sms_opt_out' => true, 'sms_opt_out_at' => now(), 'sms_opt_out_source' => $source]);
        }
        $customer->save();
    }

    /** @return array<string, array<string, bool>> */
    private static function stored(Customer $customer): array
    {
        $prefs = $customer->message_prefs;

        return is_array($prefs) ? $prefs : [];
    }
}
