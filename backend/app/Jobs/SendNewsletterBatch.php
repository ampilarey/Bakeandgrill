<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domains\Newsletter\Newsletter;
use App\Mail\NewsletterIssueMail;
use App\Models\NewsletterDelivery;
use App\Models\NewsletterIssue;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

/**
 * One batch of a newsletter (feature 4). Each row is claimed (pending → sending)
 * before its email goes, so a batch that is retried or runs twice never sends
 * an address twice.
 */
class SendNewsletterBatch implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    /** @param list<int> $deliveryIds */
    public function __construct(public int $issueId, public array $deliveryIds) {}

    public function handle(Newsletter $newsletter): void
    {
        $issue = NewsletterIssue::query()->find($this->issueId);
        if ($issue === null) {
            return;
        }
        $picks = $newsletter->picks($issue);
        foreach ($this->deliveryIds as $id) {
            $claimed = NewsletterDelivery::query()->whereKey($id)->where('status', 'pending')->update(['status' => 'sending']);
            if ($claimed !== 1) {
                continue;
            }
            $row = NewsletterDelivery::query()->with('subscriber')->find($id);
            if ($row === null || $row->subscriber === null || $row->subscriber->unsubscribed_at !== null) {
                $row?->forceFill(['status' => 'skipped'])->save();

                continue;
            }
            try {
                Mail::to($row->email)->send(new NewsletterIssueMail($issue, $row->subscriber, $picks));
                $row->forceFill(['status' => 'sent', 'sent_at' => now(), 'error' => null])->save();
            } catch (\Throwable $e) {
                $row->forceFill(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500)])->save();
            }
        }
        $newsletter->finishIfDone($issue->fresh());
    }
}
