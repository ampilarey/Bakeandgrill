<?php

declare(strict_types=1);

/**
 * Service Availability & Maintenance — configuration.
 *
 * Env fallbacks let ops disable public transactions even when DB/admin is
 * down. These are read by ServiceAvailabilityService with the highest
 * precedence (above DB state).
 *
 * enforcement_enabled is the master rollback: when false the resolver treats
 * every key as available and guards become no-ops, preserving existing gates.
 */
return [

    'enforcement_enabled' => env('SERVICE_AVAILABILITY_ENFORCEMENT_ENABLED', true),

    'emergency_write_lock' => env('EMERGENCY_WRITE_LOCK', false),

    'public_transactions_disabled' => env('PUBLIC_TRANSACTIONS_DISABLED', false),

    'cache_ttl_seconds' => 30,

    'consent_text_version' => 'v1',

    /**
     * All service keys we manage. Grouped by where they surface.
     *
     * adapter=true means the resolver composes with a legacy gate service
     * (OR of "closed") — legacy setting keys keep working unchanged.
     */
    'keys' => [
        // Public — customer-facing transactional services
        'online_ordering' => ['group' => 'public', 'adapter' => 'online', 'label' => 'Online Ordering (umbrella)'],
        'online_pickup' => ['group' => 'public', 'adapter' => 'online', 'label' => 'Online Pickup'],
        'online_delivery' => ['group' => 'public', 'adapter' => 'delivery', 'label' => 'Online Delivery'],
        'online_checkout' => ['group' => 'public', 'adapter' => null, 'label' => 'Online Checkout'],
        'online_payment' => ['group' => 'public', 'adapter' => null, 'label' => 'Online Payment'],
        'catering_inquiry' => ['group' => 'public', 'adapter' => 'catering', 'label' => 'Catering Inquiry'],
        'customer_registration' => ['group' => 'public', 'adapter' => null, 'label' => 'Customer Registration'],
        'marketing_site' => ['group' => 'public', 'adapter' => null, 'label' => 'Marketing Website'],

        // Internal — emergency only, default available
        'pos_sales' => ['group' => 'internal', 'adapter' => null, 'label' => 'POS Sales'],
        'kds_operations' => ['group' => 'internal', 'adapter' => null, 'label' => 'KDS Operations'],
        'delivery_operations' => ['group' => 'internal', 'adapter' => null, 'label' => 'Delivery Operations'],
        'emergency_write_lock' => ['group' => 'internal', 'adapter' => null, 'label' => 'Emergency Write Lock'],
    ],

    /**
     * Named atomic transitions.
     *
     * Each preset is a map of service_key => status. applyPreset() writes all
     * of them in a single DB transaction so admins get an all-or-nothing flip.
     */
    'presets' => [
        'pause_all_online_ordering' => [
            'online_ordering' => 'operational_pause',
            'online_pickup' => 'operational_pause',
            'online_delivery' => 'operational_pause',
            'online_checkout' => 'operational_pause',
        ],
        'pause_delivery_only' => [
            'online_delivery' => 'operational_pause',
        ],
        'public_transaction_maintenance' => [
            'online_checkout' => 'unavailable',
            'online_payment' => 'unavailable',
            'online_pickup' => 'unavailable',
            'online_delivery' => 'unavailable',
            'catering_inquiry' => 'unavailable',
        ],
        'emergency_lockdown' => [
            'emergency_write_lock' => 'emergency_disabled',
            'pos_sales' => 'emergency_disabled',
            'kds_operations' => 'emergency_disabled',
            'delivery_operations' => 'emergency_disabled',
            'online_checkout' => 'emergency_disabled',
            'online_payment' => 'emergency_disabled',
            'online_pickup' => 'emergency_disabled',
            'online_delivery' => 'emergency_disabled',
            'catering_inquiry' => 'emergency_disabled',
            'customer_registration' => 'emergency_disabled',
        ],
    ],

    'statuses' => [
        'available',
        'operational_pause',
        'scheduled_maintenance',
        'unavailable',
        'emergency_disabled',
    ],

    'reason_types' => [
        'technical_maintenance',
        'operational_pause',
        'payment_issue',
        'emergency',
        'scheduled',
    ],

    'consent_text' => 'By tapping Notify me, you agree to receive one SMS from Bake & Grill when this service is back. Standard rates may apply.',

    /**
     * One-time restoration SMS copy (plan §14 / Stage 6). Kept as config so
     * ops can tweak wording without a code deploy. Per-service overrides via
     * `templates.<service_key>`.
     */
    'restoration_sms' => [
        'default_template' => 'Bake & Grill: :label is back — order at :url',
        'link' => env('RESTORATION_SMS_LINK', 'https://bakeandgrill.mv/order/menu'),
        'templates' => [
            'online_checkout' => 'Bake & Grill: Online ordering is back — order at :url',
            'online_delivery' => 'Bake & Grill: Delivery is back — order at :url',
            'online_pickup' => 'Bake & Grill: Pickup is back — order at :url',
            'catering_inquiry' => 'Bake & Grill: Catering inquiries are back — get in touch at :url',
        ],
    ],

    /**
     * Subscriptions past a terminal state older than this many days are
     * anonymised by PruneRestorationSubscriptions (plan §14). Kept as config
     * so retention can be tightened without a deploy.
     */
    'restoration_retention_days' => 30,
];
