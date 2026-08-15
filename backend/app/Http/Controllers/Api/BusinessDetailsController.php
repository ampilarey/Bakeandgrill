<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\BusinessDetailsKeys;
use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Domains\Content\ContentScopeMismatch;
use App\Domains\Content\ContentValidationService;
use App\Http\Controllers\Controller;
use App\Models\GstSetting;
use App\Models\SiteSetting;
use App\Services\OpeningHoursService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Edits the shared business record (invoices, receipts, signage, SMS).
 * Never writes website or order_app scopes.
 */
class BusinessDetailsController extends Controller
{
    public function __construct(
        private readonly OpeningHoursService $openingHours,
        private readonly ContentValidationService $contentValidation,
    ) {}

    public function show(): JsonResponse
    {
        $fieldsByKey = [];
        foreach (BusinessDetailsKeys::all() as $key) {
            $meta = ContentRegistry::block($key) ?? [];
            $fieldsByKey[$key] = [
                'key' => $key,
                'label' => $this->fieldLabel($key, $meta),
                'type' => $meta['type'] ?? 'text',
                'group' => $meta['group'] ?? 'General',
                'description' => $meta['description'] ?? null,
                'value' => SiteSetting::getScoped($key, 'shared', 'en'),
                'default' => ContentRegistry::default($key),
                'used_by' => BusinessDetailsKeys::usedBy($key),
            ];
        }

        $sections = [];
        foreach (BusinessDetailsKeys::SECTIONS as $id => $keys) {
            $sections[] = [
                'id' => $id,
                'title' => match ($id) {
                    'identity' => 'Business identity',
                    'address' => 'Address and location',
                    'contact' => 'Customer contact channels',
                    'documents' => 'Receipt & document branding',
                    'brand' => 'Brand images',
                    'social' => 'Social accounts',
                    'tracking' => 'Visitor tracking',
                    default => $id,
                },
                'description' => match ($id) {
                    'identity' => 'Trading name, website and primary contact used on receipts, invoices and signage. Legal name is under Legal, tax & documents (GST).',
                    'address' => 'Shared operational address and maps links — not Website/Order App marketing layouts.',
                    'contact' => 'Phone, email and chat links for the shared business record.',
                    'documents' => 'Logo, colour and tagline. One set for the whole business — receipts, invoices, TV signage, Website and Order App.',
                    'brand' => 'Dark logo, browser tab icon, link-preview image and the stand-in photo for menu items with no picture. One set everywhere.',
                    'social' => 'Your accounts, shown in the footer of both the Website and the Order App.',
                    'tracking' => 'Google Analytics and Tag Manager IDs. These track website visitors — they are not your Google Maps location, which is under Address and location.',
                    default => null,
                },
                'fields' => array_values(array_map(
                    static fn (string $key) => $fieldsByKey[$key],
                    $keys,
                )),
            ];
        }

        return response()->json([
            'scope' => 'shared',
            'fields' => array_values($fieldsByKey),
            'sections' => $sections,
            'hours' => $this->hoursPayload(),
            'legal' => $this->legalPayload(),
            'notice' => 'These values are the shared operational business record for invoices, printed receipts, signage and SMS. Website and Order App customer-facing branding and marketing content are edited separately in Content & Branding.',
            'mismatches' => ContentScopeMismatch::collect('en'),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'changes' => ['required', 'array', 'min:1'],
            'changes.*.key' => ['required', 'string', Rule::in(BusinessDetailsKeys::all())],
            'changes.*.value' => ['nullable', 'string', 'max:5000'],
        ]);

        foreach ($data['changes'] as $index => $change) {
            $key = (string) $change['key'];
            try {
                $value = $this->contentValidation->normalizeForWrite(
                    $key,
                    'shared',
                    $change['value'] ?? '',
                );
            } catch (ValidationException $e) {
                $messages = $e->errors()['value'] ?? ['Invalid value.'];
                throw ValidationException::withMessages([
                    "changes.{$index}.value" => $messages,
                    $key => $messages,
                ]);
            }
            // Direct shared write — never ContentWriter (app scopes stay untouched).
            SiteSetting::set($key, $value, 'shared', 'en');
        }

        SiteSetting::bust();
        ContentResolver::bust();

        return $this->show();
    }

    /**
     * @param  array<string, mixed>  $meta
     */
    private function fieldLabel(string $key, array $meta): string
    {
        return match ($key) {
            'site_name' => 'Trading / display name',
            'business_website' => 'Business website URL',
            'business_phone' => 'Primary business phone',
            'business_email' => 'Primary business email',
            'business_address' => 'Full customer-facing address',
            'business_address_line1' => 'Address line 1',
            'business_address_city' => 'City / island',
            'business_address_country' => 'Country',
            'business_landmark' => 'Landmark',
            'business_maps_url' => 'Google Maps destination URL',
            'maps_embed_url' => 'Google Maps embed URL',
            'business_whatsapp' => 'WhatsApp link',
            'business_viber' => 'Viber link',
            'site_tagline' => 'Receipt / document tagline',
            'logo' => 'Receipt / document logo',
            'primary_color' => 'Receipt / document primary colour',
            default => (string) ($meta['label'] ?? $key),
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function hoursPayload(): array
    {
        $dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        $hours = $this->openingHours->getHoursForDisplay();
        $weekly = [];
        foreach ($dayNames as $i => $name) {
            $row = $hours[$i] ?? null;
            if (! is_array($row) || ($row['closed'] ?? false)) {
                $weekly[] = ['day' => $name, 'label' => 'Closed'];
                continue;
            }
            $open = (string) ($row['open'] ?? '');
            $close = (string) ($row['close'] ?? '');
            $weekly[] = [
                'day' => $name,
                'label' => ($open !== '' && $close !== '') ? "{$open} – {$close}" : 'Open',
            ];
        }

        $closuresRaw = SiteSetting::get('business_closures_json');
        $closures = [];
        if (is_string($closuresRaw) && $closuresRaw !== '' && $closuresRaw !== '{}') {
            $decoded = json_decode($closuresRaw, true);
            if (is_array($decoded)) {
                foreach ($decoded as $date => $reason) {
                    $closures[] = [
                        'date' => (string) $date,
                        'reason' => is_string($reason) ? $reason : 'Closed',
                    ];
                }
            }
        }

        return [
            'source' => 'business_hours_json',
            'editor_path' => '/admin/online-ordering',
            'editor_label' => 'Online Ordering schedule',
            'weekly' => $weekly,
            'closures' => $closures,
            'open_now' => $this->openingHours->isOpenNow(),
            'ramadan_hours_active' => $this->openingHours->isRamadanHoursActive(),
            'note' => 'Regular hours, temporary closures and holiday/Ramadan schedules are managed with the operational Online Ordering schedule. Website Content → Opening hours only changes public display wording.',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function legalPayload(): array
    {
        $gst = GstSetting::query()->first();

        return [
            'source' => 'gst_settings',
            'editor_path' => '/admin/gst',
            'editor_label' => 'GST settings',
            'seller_name' => $gst?->seller_name,
            'seller_address' => $gst?->seller_address,
            'seller_tin' => $gst?->seller_tin,
            'taxable_activity_no' => $gst?->taxable_activity_no,
            'gst_registered' => (bool) ($gst?->gst_registered ?? false),
            'receipt_name' => SiteSetting::getScoped('site_name', 'shared', 'en'),
            'receipt_phone' => SiteSetting::getScoped('business_phone', 'shared', 'en'),
            'receipt_email' => SiteSetting::getScoped('business_email', 'shared', 'en'),
            'receipt_address' => SiteSetting::getScoped('business_address', 'shared', 'en'),
            'note' => 'Legal/tax identity is stored in GST settings (authoritative). Receipt name, phone, email and address use the shared Business Details fields on this page — edit them in the sections above, not here.',
        ];
    }
}
