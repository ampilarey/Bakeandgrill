@php
    use App\Models\SiteSetting;

    $brandSiteName = SiteSetting::get('site_name', config('business.name', 'Bake & Grill'));
    $brandTagline = SiteSetting::get('site_tagline', 'Fresh grills & baked favorites');
    $brandPrimary = SiteSetting::get('primary_color', '#D4813A');
    $brandDark = SiteSetting::get('secondary_color', '#1C1408');
    $brandPhone = SiteSetting::get('business_phone', config('business.phone'));
    $brandEmail = SiteSetting::get('business_email', config('business.email'));
    $brandAddress = SiteSetting::get('business_address', config('business.address.full'));
    $brandLogoWeb = SiteSetting::get('logo', asset('logo.png'));

    $brandLogoPdf = public_path('logo.png');
    $logoPath = parse_url((string) $brandLogoWeb, PHP_URL_PATH);
    if (is_string($logoPath) && $logoPath !== '' && file_exists(public_path(ltrim($logoPath, '/')))) {
        $brandLogoPdf = public_path(ltrim($logoPath, '/'));
    }
@endphp
