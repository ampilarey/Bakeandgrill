<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Services;

use App\Domains\Sms\Services\SmsTemplateRenderer;
use App\Models\SmsTemplate;

final class CustomerSmsMessageBuilder
{
    public const SLUG_PAYMENT_CONFIRMED_POS = 'customer_payment_confirmed_pos';

    public const SLUG_PAYMENT_CONFIRMED_ONLINE = 'customer_payment_confirmed_online';

    public const SLUG_COMPLETION_RECEIPT = 'customer_completion_receipt';

    public const SLUG_SEND_BILL = 'customer_send_bill';

    public const SLUG_SEND_PAY_LINK = 'customer_send_pay_link';

    public const SLUG_FIRE_TO_KITCHEN = 'customer_fire_to_kitchen';

    public const SLUG_RECEIPT_RESEND = 'customer_receipt_resend';

    public const SLUG_ORDER_PREPARING = 'customer_order_preparing';

    public const SLUG_ORDER_READY_PICKUP = 'customer_order_ready_pickup';

    public const SLUG_ORDER_READY_DELIVERY = 'customer_order_ready_delivery';

    public const SLUG_ORDER_ON_THE_WAY = 'customer_order_on_the_way';

    public function __construct(private readonly SmsTemplateRenderer $renderer) {}

    public function build(string $slug, array $variables, string $fallback): string
    {
        $template = SmsTemplate::where('slug', $slug)->first();
        if ($template === null || trim($template->body) === '') {
            return $this->renderer->renderRaw($fallback, $variables);
        }

        return $this->renderer->render($template, $variables);
    }
}
