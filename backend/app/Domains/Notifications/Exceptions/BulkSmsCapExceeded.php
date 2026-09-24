<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Exceptions;

/** The shared daily bulk recipient cap would be passed (SmsDeliveryRules::bulkCapReason). */
final class BulkSmsCapExceeded extends \RuntimeException {}
