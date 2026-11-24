<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use RuntimeException;

/** The assistant could not answer; the message is for the person at the screen. */
class AssistantUnavailable extends RuntimeException {}
