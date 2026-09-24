<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domains\Social\Services\SocialPostApproval;
use App\Models\SocialPost;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\View\View;

/**
 * Approval on the phone (owner's shortlist, 2026-09-24): the page a
 * signed SMS link opens. Shows the post as it will go out and two
 * buttons; each is its own signed action so the page can be reloaded
 * or shared without re-signing anything.
 */
class SocialApprovalPageController extends Controller
{
    public function show(int $post): View
    {
        $post = SocialPost::with('deliveries.channel')->findOrFail($post);
        $expires = now()->addHours(SocialPostApproval::LINK_HOURS);

        return view('social-approve', [
            'post' => $post,
            'canAct' => in_array($post->status, SocialPostApproval::APPROVABLE, true),
            'approveUrl' => URL::temporarySignedRoute('social.approve.approve', $expires, ['post' => $post->id]),
            'rejectUrl' => URL::temporarySignedRoute('social.approve.reject', $expires, ['post' => $post->id]),
            'channels' => $post->deliveries->map(fn ($d) => $d->channel?->name)->filter()->values()->all(),
        ]);
    }

    public function approve(Request $request, SocialPostApproval $approval, int $post): RedirectResponse
    {
        $post = SocialPost::findOrFail($post);
        if (in_array($post->status, SocialPostApproval::APPROVABLE, true)) {
            $approval->approve($post, 'sms link ' . $request->ip());
        }

        return redirect()->to(URL::temporarySignedRoute('social.approve.show', now()->addHours(SocialPostApproval::LINK_HOURS), ['post' => $post->id]))
            ->with('social_approval', 'approved');
    }

    public function reject(Request $request, SocialPostApproval $approval, int $post): RedirectResponse
    {
        $post = SocialPost::findOrFail($post);
        if (in_array($post->status, SocialPostApproval::APPROVABLE, true)) {
            $approval->reject($post, 'sms link ' . $request->ip());
        }

        return redirect()->to(URL::temporarySignedRoute('social.approve.show', now()->addHours(SocialPostApproval::LINK_HOURS), ['post' => $post->id]))
            ->with('social_approval', 'rejected');
    }
}
