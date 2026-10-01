<?php

declare(strict_types=1);

namespace App\Support;

/**
 * A cell that a spreadsheet will show as text, never run as a formula
 * (security audit, 2026-10-01). A customer can choose their own name, and a
 * name beginning "=", "+", "-" or "@" in an exported CSV is a formula the
 * moment the owner opens the file. Same rule the reports export already used.
 */
final class CsvCell
{
    public static function safe(mixed $value): string
    {
        if ($value === null) {
            return '';
        }
        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }
        $string = (string) $value;
        if (is_numeric($string)) {
            return $string;
        }

        return preg_match('/^[=+\-@\t\r]/', $string) === 1 ? "'" . $string : $string;
    }

    /**
     * @param array<int|string, mixed> $row
     * @return list<string>
     */
    public static function row(array $row): array
    {
        return array_values(array_map(self::safe(...), $row));
    }
}
