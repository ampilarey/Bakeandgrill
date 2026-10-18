<?php

declare(strict_types=1);

namespace App\Domains\Notifications\Support;

use App\Models\Customer;
use App\Models\SmsTemplate;
use App\Support\LocaleUrl;

/**
 * A customer's text in their own language (iruali import plan, feature 3b).
 *
 * With "Dhivehi on the website and in the order app" on, a customer whose
 * account keeps Dhivehi (customers.preferred_language, Account → Settings)
 * gets the Dhivehi wording of a message: the template's own (body_dv, typed
 * on the row in Admin → Notifications → Messages), else the built-in one
 * below. Switched off, or for anyone else, the English goes as before.
 * The {{variables}} are the English template's; English-only fragments
 * ({{greeting}}, {{ready_hint}}, {{invoice_line}}…) are left out here.
 */
final class CustomerSmsText
{
    /** @var array<string, string> template slug => built-in Dhivehi wording */
    public const DEFAULTS = [
        'auth_customer_otp' => 'Bake & Grill ގެ ވެރިފިކޭޝަން ކޯޑަކީ {{code}}. {{minutes}} މިނެޓު ވަންދެން ބޭނުންކުރެވޭނެ. މި ކޯޑު އެހެން މީހަކަށް ނުދެއްވާ.',
        'customer_order_confirmed' => '#{{order_number}} ޔަގީންކުރެވިއްޖެ. ފޮލޯ ކުރޭ: {{tracking_url}}',
        'customer_payment_confirmed_online' => 'ފައިސާ ލިބިއްޖެ. #{{order_number}} ޔަގީންކުރެވިއްޖެ. {{tracking_url}}',
        'customer_payment_confirmed_pos' => '#{{order_number}} ގެ ރަސީދު: {{receipt_url}}',
        'customer_completion_receipt' => 'އޯޑަރު #{{order_number}} ނިމިއްޖެ. ރަސީދު: {{receipt_url}}',
        'customer_order_preparing' => '#{{order_number}} ތައްޔާރުކުރަނީ. ތައްޔާރުވުމުން އެސްއެމްއެސް ކުރާނަން. {{tracking_url}}',
        'customer_order_ready_pickup' => '#{{order_number}} ނަގަން ތައްޔާރު. {{tracking_url}}',
        'customer_order_ready_delivery' => '#{{order_number}} ޕެކްކުރެވިއްޖެ. ރައިޑަރު އަވަހަށް ނަގާނެ. {{tracking_url}}',
        'customer_order_on_the_way' => '#{{order_number}} އަންނަނީ. {{tracking_url}}',
        'customer_order_delivered' => 'Bake & Grill: #{{order_number}} ޑެލިވަރީ ކުރެވިއްޖެ. ހިތްހަމަޖެހިގެން ބޭނުންކުރައްވާ! ރަސީދު: {{receipt_url}}',
        'customer_fire_to_kitchen' => '{{order_number}} ލިބިއްޖެ. ޖުމްލަ: MVR {{total}}. ތައްޔާރުވުމުން އެސްއެމްއެސް ކުރާނަން.',
        'customer_receipt_resend' => 'Bake & Grill އަށް ވަޑައިގެންނެވީތީ ޝުކުރިއްޔާ! ރަސީދު: {{receipt_url}}',
        'customer_send_bill' => 'ބިލު #{{invoice_number}} - MVR {{total}}. ބައްލަވާ: {{invoice_url}}',
        'customer_send_pay_link' => 'Bake & Grill ގެ ބިލު ދައްކަން ތައްޔާރު. އަދަދު: MVR {{amount}}، އޯޑަރު: {{order_number}}. ބައްލަވައި ދައްކަވާ: {{pay_url}} ޝުކުރިއްޔާ!',
        'customer_refund_to_wallet' => 'Bake & Grill: އޯޑަރު {{order_number}} ގެ ރީފަންޑުން MVR {{amount}} ވޯލެޓަށް ވައްދައިފި. ދެން ކުރާ އޯޑަރުގައި ބޭނުންކުރެވޭނެ.',
        'customer_refund_completed' => 'Bake & Grill: އޯޑަރު {{order_number}} ގެ ރީފަންޑް ނިމިއްޖެ.',
        'customer_refund_on_its_way' => 'Bake & Grill: އޯޑަރު {{order_number}} ގެ MVR {{amount}} ގެ ރީފަންޑް ހުއްދަކުރެވިއްޖެ. ކާޑު ނުވަތަ އޮންލައިންކޮށް ދެއްކި ބައި އެނބުރި ފޮނުވަނީ، ފޮނުވުމުން މެސެޖު ކުރާނަން.',
        'customer_refund_rejected' => 'Bake & Grill: އޯޑަރު {{order_number}} ގެ ރީފަންޑް ހުއްދައެއް ނުކުރެވުނު. ސުވާލެއް އެބަހުރިނަމަ ގުޅުއްވާ.',
        'customer_refund_otp' => 'Bake & Grill: އޯޑަރު {{order_number}} ގެ ރީފަންޑް ޔަގީންކުރާ ކޯޑަކީ {{code}}. ކޭޝިއަރަށް މި ކޯޑު ބުނެދެއްވާ. {{minutes}} މިނެޓުން ހަމަވާނެ.',
        'customer_complaint_acknowledged' => 'Bake & Grill: ތިޔަ ހުށަހެޅި ކަންބޮޑުވުން ({{reference}}) ލިބިއްޖެ. ބަލާނަން.',
        'customer_complaint_box_acknowledged' => 'Bake & Grill: ޝުކުރިއްޔާ، ޝަކުވާ ({{reference}}) ލިބިއްޖެ. ބަލައި މިތާ މެސެޖު ކުރާނަން.',
        'customer_complaint_box_update' => 'Bake & Grill ({{reference}}): {{message}}',
        'customer_complaint_resolved' => 'Bake & Grill ({{reference}}): {{customer_reply}}',
        'customer_credit_approved' => 'Bake & Grill: ކްރެޑިޓް އެކައުންޓް ހުއްދަކުރެވިއްޖެ. ލިމިޓް MVR {{limit}}، ކޮންމެ އިންވޮއިހެއް {{terms_days}} ދުވަހުގެ ތެރޭގައި ދައްކަވާ. ޝުކުރިއްޔާ!',
        'customer_credit_limit_changed' => 'Bake & Grill: ކްރެޑިޓް ލިމިޓް MVR {{old_limit}} ން MVR {{limit}} އަށް ބަދަލުކުރެވިއްޖެ. މިހާރު ލިބެން ހުރީ: MVR {{available}}.',
        'catering_request_received' => 'އިވެންޓް އެދުން {{reference}} ލިބިއްޖެ. ތަފްޞީލު: {{view_url}}',
        'catering_confirmed_customer' => 'އިވެންޓް ޔަގީންކުރެވިއްޖެ - {{reference}}، MVR {{paid}} ދައްކާފައި. {{when}}{{venue}}',
        'credit_reminder_upcoming' => 'Bake & Grill: ކްރެޑިޓް އިންވޮއިސް {{invoice_number}} - MVR {{amount}}، ދައްކަންޖެހޭ ތާރީޚު {{due_date}}. ބައްލަވާ: {{link}}',
        'credit_reminder_due_today' => 'Bake & Grill: ކްރެޑިޓް ފައިސާ ދައްކަންޖެހެނީ މިއަދު - އިންވޮއިސް {{invoice_number}}، MVR {{amount}}. ބައްލަވާ: {{link}}',
        'credit_reminder_overdue' => 'Bake & Grill: ކްރެޑިޓް އިންވޮއިސް {{invoice_number}} ގެ މުއްދަތު {{days_overdue}} ދުވަސް ފަހަނައަޅައިފި (MVR {{amount}}، ތާރީޚު {{due_date}}). ބައްލަވާ: {{link}}',
        'credit_balance_reminder' => 'Bake & Grill: ކްރެޑިޓް އެކައުންޓުގެ ބާކީ MVR {{balance}}. ފަހި ވަގުތެއްގައި ދައްކަވާ. ޝުކުރިއްޔާ!',
        'credit_pay_link' => 'Bake & Grill: ކްރެޑިޓް އިންވޮއިސް {{invoice_number}} (MVR {{amount}}) ކާޑުން އޮންލައިންކޮށް ދައްކަވާ: {{link}} - ޝުކުރިއްޔާ!',
    ];

    /** 'dv' when Dhivehi is on and the customer with this number keeps Dhivehi, else 'en'. */
    public static function language(?string $phone): string
    {
        $phone = trim((string) $phone);
        if ($phone === '' || !LocaleUrl::dhivehiOn()) {
            return 'en';
        }
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if (strlen($digits) < 7) {
            return 'en';
        }
        $seven = substr($digits, -7);
        $lang = Customer::query()
            ->whereIn('phone', [$seven, '960' . $seven, '+960' . $seven])
            ->value('preferred_language');

        return $lang === 'dv' ? 'dv' : 'en';
    }

    /** The same for an email: the customer with this number, else with this email address. */
    public static function languageFor(?string $phone, ?string $email = null): string
    {
        if (self::language($phone) === 'dv') {
            return 'dv';
        }
        $email = strtolower(trim((string) $email));
        if ($email === '' || !LocaleUrl::dhivehiOn()) {
            return 'en';
        }

        return Customer::query()->whereRaw('LOWER(email) = ?', [$email])->value('preferred_language') === 'dv' ? 'dv' : 'en';
    }

    /** The wording to send: the Dhivehi one for a Dhivehi customer, else $english unchanged. */
    public static function body(string $slug, string $english, ?string $phone): string
    {
        if (self::language($phone) !== 'dv') {
            return $english;
        }
        $own = trim((string) SmsTemplate::query()->where('slug', $slug)->value('body_dv'));

        return $own !== '' ? $own : (self::DEFAULTS[$slug] ?? $english);
    }
}
