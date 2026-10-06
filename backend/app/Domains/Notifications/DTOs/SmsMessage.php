<?php

declare(strict_types=1);

namespace App\Domains\Notifications\DTOs;

final readonly class SmsMessage
{
    /**
     * @param  string  $type  Registry key (preferred) or legacy category
     * @param  int|null  $actingUserId  When set, SmsService enforces the type's
     *                                  send_permission for this staff user.
     *                                  Leave null for system-initiated sends
     *                                  (OTP, observers, queued jobs).
     */
    public function __construct(
        public string $to,
        public string $message,
        public string $type,
        public ?int $customerId = null,
        public ?int $campaignId = null,
        public ?string $referenceType = null,
        public ?string $referenceId = null,
        public ?string $idempotencyKey = null,
        public ?int $actingUserId = null,
        /**
         * The caller's own switch has this SMS off (owner, 2026-10-06:
         * "Some times admin turn off some types of sms notifications to
         * reduce sms cost. But email should not stop"). No text goes; the
         * email copy still does, if that type's email is on.
         */
        public bool $emailOnly = false,
    ) {}
}
