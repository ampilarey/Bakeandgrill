<?php

declare(strict_types=1);

namespace App\Http\Requests\Prayer;

use App\Support\PrayerTimeHelper;
use Illuminate\Foundation\Http\FormRequest;

class PrayerTimesWebRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'island_id' => ['nullable', 'integer', 'min:1', 'max:32767', 'exists:prayer_islands,id'],
            'date' => ['nullable', 'date_format:Y-m-d'],
        ];
    }

    public function resolvedDate(): \Carbon\Carbon
    {
        $raw = $this->query('date', '');

        if ($raw) {
            $parsed = PrayerTimeHelper::parseDate($raw);
            if ($parsed !== null) {
                return $parsed;
            }
        }

        return PrayerTimeHelper::todayInMvt();
    }

    public function resolvedIslandId(): int
    {
        return (int) $this->query('island_id', 0);
    }
}
