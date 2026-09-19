<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Complaints\Services\ComplaintBoxService;
use App\Http\Controllers\Controller;
use App\Models\ComplaintBoxEntry;
use App\Rules\MaldivesPhone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;

/**
 * POST /api/complaint-box — the public complaint form, no login, no token.
 *
 * Anyone can file, so the limits are the only gate: per network per hour,
 * and per phone number per day when one is given. A hidden field that only
 * a bot would fill is accepted and quietly ignored.
 */
class PublicComplaintBoxController extends Controller
{
    public function __construct(private readonly ComplaintBoxService $box) {}

    public function store(Request $request): JsonResponse
    {
        $ip = (string) $request->ip();
        // Per network, not per person: Dhiraagu and Ooredoo mobile data share
        // one public address across many phones, so this stays generous.
        if (RateLimiter::tooManyAttempts('complaint-box-ip:' . $ip, 30)) {
            return response()->json(['message' => 'Too many complaints from this network. Please try again later, or call us.'], 429);
        }

        $validated = $request->validate([
            'categories' => ['required', 'array', 'min:1', 'max:' . ComplaintBoxEntry::MAX_CATEGORIES],
            'categories.*' => ['string', Rule::in(ComplaintBoxEntry::CATEGORIES)],
            'comment' => ['nullable', 'string', 'max:2000'],
            'about_staff' => ['nullable', 'string', 'max:120'],
            'order_ref' => ['nullable', 'string', 'max:40'],
            'visited_on' => ['nullable', 'date', 'before_or_equal:today'],
            'anonymous' => ['nullable', 'boolean'],
            'phone' => ['nullable', 'string', 'max:20', new MaldivesPhone],
            'source' => ['nullable', 'string', Rule::in(['web', 'receipt', 'poster'])],
            // Honeypot.
            'website' => ['nullable', 'string', 'max:0'],
        ], [
            'phone.required' => 'Enter your mobile number, or choose to stay anonymous.',
        ]);

        $anonymous = $request->boolean('anonymous', true);
        $phone = $anonymous ? null : trim((string) ($validated['phone'] ?? ''));
        if (!$anonymous && $phone === '') {
            return response()->json([
                'message' => 'Enter your mobile number, or choose to stay anonymous.',
                'errors' => ['phone' => ['Enter your mobile number, or choose to stay anonymous.']],
            ], 422);
        }
        if ($phone !== null && $phone !== '') {
            $key = 'complaint-box-phone:' . MaldivesPhone::normalize($phone);
            if (RateLimiter::tooManyAttempts($key, 3)) {
                return response()->json(['message' => 'This number has already sent several complaints today. We have them — please give us time to respond.'], 429);
            }
            RateLimiter::hit($key, 86400);
        }
        RateLimiter::hit('complaint-box-ip:' . $ip, 3600);

        $entry = $this->box->file([
            'categories' => $validated['categories'],
            'comment' => $validated['comment'] ?? null,
            'about_staff' => $validated['about_staff'] ?? null,
            'phone' => $phone ?: null,
            'order_ref' => $validated['order_ref'] ?? null,
            'visited_on' => $validated['visited_on'] ?? null,
            'source' => $validated['source'] ?? 'web',
            'ip' => $ip,
        ]);

        return response()->json([
            'reference_number' => $entry->reference_number,
            'anonymous' => $entry->is_anonymous,
            'confirmation' => $entry->is_anonymous
                ? "Thank you. Your complaint is recorded as {$entry->reference_number} and the owner has been told."
                : "Thank you. Your complaint is recorded as {$entry->reference_number}, the owner has been told, and we will message you on this number.",
        ], 201);
    }
}
