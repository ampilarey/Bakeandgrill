<?php

declare(strict_types=1);

namespace App\Domains\System;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Notifications\Support\AlertSwitch;
use App\Models\ErrorEvent;
use App\Support\OwnerPhones;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Errors counted without an outside service (iruali import plan, feature 17).
 *
 * Every reported exception, except the everyday ones (a wrong form, a missing
 * page, a sign-in needed, too many tries), is counted by kind and day in
 * `error_events`. `errors:digest` sends the owners yesterday's list each
 * morning (row "Owner: daily error report"), and an error in the payment code
 * (BML, gift cards, the wallet, refunds) tells them at once, once an hour per
 * kind (row "Owner: payment error"). Sentry, when its DSN is set, still gets
 * every exception as well; this is the record that needs nothing set up.
 *
 * Recording never throws: a broken database must not turn one error into two.
 */
final class ErrorTracker
{
    public const DIGEST_TYPE = 'owner_error_digest';

    public const PAYMENT_TYPE = 'owner_payment_error';

    /** Exceptions that are part of normal use, never counted. */
    private const SKIP = [
        ValidationException::class,
        AuthenticationException::class,
        AuthorizationException::class,
        ModelNotFoundException::class,
        ThrottleRequestsException::class,
        TokenMismatchException::class,
        PostTooLargeException::class,
        HttpResponseException::class,
    ];

    /** Words in a class or file path that mark the money code. */
    private const PAYMENT_WORDS = ['Payment', 'Bml', 'BML', 'GiftCard', 'Deposit', 'Refund', 'Wallet'];

    private static bool $recording = false;

    private static ?bool $tableReady = null;

    public static function record(Throwable $e): void
    {
        if (self::$recording || self::skip($e)) {
            return;
        }
        self::$recording = true;
        try {
            if (!self::tableReady()) {
                return;
            }
            $event = self::upsert($e);
            if ($event !== null && $event->payment) {
                self::alertPayment($event);
            }
        } catch (Throwable) {
            // Never let the tracker raise; the log line in bootstrap/app.php still has it.
        } finally {
            self::$recording = false;
        }
    }

    public static function skip(Throwable $e): bool
    {
        foreach (self::SKIP as $class) {
            if ($e instanceof $class) {
                return true;
            }
        }

        return $e instanceof HttpExceptionInterface && $e->getStatusCode() < 500;
    }

    public static function fingerprint(Throwable $e): string
    {
        return sha1($e::class . '|' . self::relative($e->getFile()) . '|' . $e->getLine());
    }

    public static function isPaymentRelated(Throwable $e): bool
    {
        $haystack = $e::class . ' ' . self::relative($e->getFile());
        foreach (self::PAYMENT_WORDS as $word) {
            if (str_contains($haystack, $word)) {
                return true;
            }
        }
        foreach (array_slice($e->getTrace(), 0, 12) as $frame) {
            $where = ($frame['class'] ?? '') . ' ' . self::relative((string) ($frame['file'] ?? ''));
            if (str_contains($where, 'vendor/')) {
                continue;
            }
            foreach (self::PAYMENT_WORDS as $word) {
                if (str_contains($where, $word)) {
                    return true;
                }
            }
        }

        return false;
    }

    /** For tests: forget whether the table was found. */
    public static function reset(): void
    {
        self::$tableReady = null;
        self::$recording = false;
    }

    private static function tableReady(): bool
    {
        return self::$tableReady ??= Schema::hasTable('error_events');
    }

    private static function upsert(Throwable $e): ?ErrorEvent
    {
        $now = now();
        $day = $now->toDateString();
        $fingerprint = self::fingerprint($e);
        $url = app()->runningInConsole() ? ('artisan ' . implode(' ', array_slice($_SERVER['argv'] ?? [], 1, 3))) : request()->fullUrl();

        return DB::transaction(function () use ($e, $now, $day, $fingerprint, $url) {
            $event = ErrorEvent::query()->where('fingerprint', $fingerprint)->whereDate('day', $day)->lockForUpdate()->first();
            if ($event) {
                $event->forceFill([
                    'count' => $event->count + 1,
                    'last_seen_at' => $now,
                    'message' => mb_substr($e->getMessage(), 0, 2000),
                    'url' => mb_substr($url, 0, 500),
                ])->save();

                return $event;
            }

            return ErrorEvent::create([
                'day' => $day,
                'fingerprint' => $fingerprint,
                'exception' => mb_substr($e::class, 0, 191),
                'message' => mb_substr($e->getMessage(), 0, 2000),
                'file' => mb_substr(self::relative($e->getFile()), 0, 255),
                'line' => $e->getLine(),
                'url' => mb_substr($url, 0, 500),
                'count' => 1,
                'payment' => self::isPaymentRelated($e),
                'first_seen_at' => $now,
                'last_seen_at' => $now,
            ]);
        });
    }

    /** A payment error tells the owners at once, at most once an hour per kind. */
    private static function alertPayment(ErrorEvent $event): void
    {
        $recent = ErrorEvent::query()
            ->where('fingerprint', $event->fingerprint)
            ->where('alerted_at', '>=', now()->subHour())
            ->exists();
        if ($recent || !AlertSwitch::isOn(self::PAYMENT_TYPE)) {
            return;
        }
        $event->forceFill(['alerted_at' => now()])->save();

        $message = 'Bake & Grill: a payment error just happened (' . class_basename($event->exception) . ' in '
            . basename((string) $event->file) . '). Check System → Health and the last online payments.';
        $sms = app(SmsService::class);
        foreach (OwnerPhones::for(self::PAYMENT_TYPE) as $phone) {
            try {
                $sms->send(new SmsMessage(
                    to: $phone,
                    message: $message,
                    type: self::PAYMENT_TYPE,
                    referenceType: 'error_event',
                    referenceId: (string) $event->id,
                    idempotencyKey: 'payment-error:' . $event->fingerprint . ':' . now()->format('YmdH') . ':' . $phone,
                ));
            } catch (Throwable $sendError) {
                Log::warning('Payment error alert could not be sent', ['phone' => $phone, 'error' => $sendError->getMessage()]);
            }
        }
    }

    private static function relative(string $path): string
    {
        $base = rtrim(base_path(), '/') . '/';

        return str_starts_with($path, $base) ? substr($path, strlen($base)) : $path;
    }
}
