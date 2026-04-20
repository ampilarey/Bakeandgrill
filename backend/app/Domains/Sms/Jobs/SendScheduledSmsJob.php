<?php

declare(strict_types=1);

namespace App\Domains\Sms\Jobs;

use App\Domains\Notifications\DTOs\SmsMessage;
use App\Domains\Notifications\Services\SmsService;
use App\Domains\Sms\Services\SmsContactResolver;
use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsScheduledMessage;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendScheduledSmsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(
        public readonly int $scheduledMessageId,
        public readonly ?string $sendAtOverride = null,
    ) {}

    public function handle(
        SmsService $smsService,
        SmsContactResolver $contactResolver,
        SmsTemplateRenderer $templateRenderer,
    ): void {
        $scheduled = SmsScheduledMessage::with(['contact.user', 'group.contacts.user', 'template'])
            ->find($this->scheduledMessageId);

        if (! $scheduled) {
            Log::warning('SendScheduledSmsJob: scheduled message not found', ['id' => $this->scheduledMessageId]);

            return;
        }

        $at = $this->sendAtOverride
            ? Carbon::parse($this->sendAtOverride)
            : Carbon::now();

        // Resolve recipients
        $phones = $contactResolver->resolveForScheduledMessage(
            toType: $scheduled->to_type,
            contact: $scheduled->contact,
            group: $scheduled->group,
            rawPhone: $scheduled->to_phone,
            at: $at,
        );

        if ($phones->isEmpty()) {
            Log::info('SendScheduledSmsJob: no active recipients', ['id' => $this->scheduledMessageId]);

            return;
        }

        // Render the message body
        $body = $this->resolveBody($scheduled, $templateRenderer);

        if (empty($body)) {
            Log::warning('SendScheduledSmsJob: empty message body', ['id' => $this->scheduledMessageId]);

            return;
        }

        // Send to each recipient
        foreach ($phones as $phone) {
            $idempotencyKey = 'scheduled:' . $this->scheduledMessageId . ':' . $at->format('YmdHi') . ':' . $phone;

            try {
                $smsService->send(new SmsMessage(
                    to: $phone,
                    message: $body,
                    type: 'scheduled',
                    referenceType: 'sms_scheduled_message',
                    referenceId: (string) $this->scheduledMessageId,
                    idempotencyKey: $idempotencyKey,
                ));
            } catch (\Throwable $e) {
                Log::error('SendScheduledSmsJob: failed to send', [
                    'id'    => $this->scheduledMessageId,
                    'phone' => $phone,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function resolveBody(SmsScheduledMessage $scheduled, SmsTemplateRenderer $renderer): string
    {
        if ($scheduled->template) {
            return $renderer->render($scheduled->template, $scheduled->variables ?? []);
        }

        if ($scheduled->body) {
            return $renderer->renderRaw($scheduled->body, $scheduled->variables ?? []);
        }

        return '';
    }
}
