<?php

declare(strict_types=1);

if (!function_exists('routes_domain_section')) {
    /**
     * @return non-empty-string|null
     */
    function routes_domain_section(string $domain): ?string
    {
        /** @var array<string, string>|null $sections */
        $sections = $GLOBALS['routes_sections'] ?? null;

        return $sections[$domain] ?? null;
    }

    function routes_domain_section_is(string $domain, string $section): bool
    {
        return routes_domain_section($domain) === $section;
    }

    function routes_domain_section_is_or_unset(string $domain, string $defaultSection, string $section): bool
    {
        $current = routes_domain_section($domain) ?? $defaultSection;

        return $current === $section;
    }

    function routes_domain_loaded(string $key): bool
    {
        return ($GLOBALS['routes_loaded'][$key] ?? false) === true;
    }

    function routes_domain_mark_loaded(string $key): void
    {
        $GLOBALS['routes_loaded'][$key] = true;
    }
}
