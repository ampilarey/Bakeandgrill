<?php

declare(strict_types=1);

namespace App\Domains\Ai;

use App\Domains\Reviews\ReviewPhotos;
use App\Models\Review;
use Illuminate\Support\Facades\Storage;

/**
 * A line on each waiting review's photo (owner, 2026-11-24), for whoever moderates it:
 * what it shows, and "Check before showing" when it should be looked at with care. It
 * decides nothing: every review still waits for a person, as it always did. Each review
 * is looked at once (`photo_noted_at`).
 */
class ReviewPhotoNotes
{
    public function __construct(private readonly AiTasks $tasks, private readonly PhotoWork $photos) {}

    /** @return int how many reviews got a note */
    public function look(int $most = 15): int
    {
        $noted = 0;
        $rows = Review::query()->with('item:id,name')->where('status', 'pending')->whereNull('photo_noted_at')->whereNotNull('photos')->orderBy('id')->limit(60)->get();
        foreach ($rows as $review) {
            if ($noted >= $most) {
                break;
            }
            $path = (string) (((array) $review->photos)[0]['path'] ?? '');
            $bytes = $path !== '' && Storage::disk(ReviewPhotos::DISK)->exists($path) ? Storage::disk(ReviewPhotos::DISK)->get($path) : null;
            $small = is_string($bytes) && $bytes !== '' ? $this->photos->forLooking($bytes, 1200) : null;
            $note = $small !== null ? $this->tasks->reviewPhoto(['bytes' => $small['bytes'], 'mime' => $small['mime']], (string) ($review->item?->name ?? '')) : '';
            $review->forceFill(['photo_note' => $note !== '' ? $note : null, 'photo_noted_at' => now()])->saveQuietly();
            $noted += $note !== '' ? 1 : 0;
        }

        return $noted;
    }
}
