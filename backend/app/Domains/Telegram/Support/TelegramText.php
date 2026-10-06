<?php

declare(strict_types=1);

namespace App\Domains\Telegram\Support;

/** Small helpers for Telegram HTML messages. */
final class TelegramText
{
    /** Escape anything a person typed (names, notes, item names). */
    public static function e(?string $text): string
    {
        return htmlspecialchars((string) $text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public static function mvr(float|int|string|null $amount): string
    {
        return 'MVR ' . number_format((float) $amount, 2);
    }

    /** "2h 15m", "40m": how long ago something happened. */
    public static function ago(?\DateTimeInterface $at): string
    {
        if ($at === null) {
            return '';
        }
        $minutes = max(0, (int) floor((time() - $at->getTimestamp()) / 60));
        if ($minutes < 60) {
            return $minutes . 'm';
        }
        $h = intdiv($minutes, 60);
        $m = $minutes % 60;

        return $h . 'h' . ($m > 0 ? ' ' . $m . 'm' : '');
    }

    /** Telegram caps a message at 4096 characters. */
    public static function clip(string $html, int $max = 3900): string
    {
        return mb_strlen($html) > $max ? mb_substr($html, 0, $max) . "\n…" : $html;
    }

    /** One button. */
    public static function button(string $label, string $data): array
    {
        return ['text' => $label, 'callback_data' => $data];
    }
}
