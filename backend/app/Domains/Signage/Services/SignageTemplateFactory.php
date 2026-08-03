<?php

declare(strict_types=1);

namespace App\Domains\Signage\Services;

/**
 * Pre-built element-tree templates + default playlist + emergency slides.
 */
final class SignageTemplateFactory
{
    /** @return list<array<string, mixed>> */
    public static function defaultPlaylistSlides(): array
    {
        return [
            self::template('hero', [
                'name' => 'Welcome',
                'seconds' => 12,
                'weight' => 2,
                'fields' => [
                    'title' => '{{branch_name}}',
                    'subtitle' => 'Freshly baked · Grilled to order',
                    'eyebrow' => 'Dine-in menu',
                ],
            ]),
            // Expands client-side into showcase + category slides from the live menu.
            self::template('auto_menu', [
                'name' => 'Full menu',
                'seconds' => 10,
                'weight' => 3,
                'fields' => ['title' => 'Our menu'],
            ]),
            self::smartSlide('offers', ['name' => "Today's offers", 'seconds' => 14, 'weight' => 4]),
            self::smartSlide('bestsellers', ['name' => 'Bestsellers', 'seconds' => 14, 'weight' => 3]),
            self::smartSlide('new', ['name' => 'New on the menu', 'seconds' => 12, 'weight' => 2]),
            self::template('qr', [
                'name' => 'Scan for full menu',
                'seconds' => 10,
                'weight' => 1,
                'fields' => [
                    'title' => 'Scan for the full menu',
                    'subtitle' => 'Wi‑Fi: {{wifi_name}} · {{wifi_password}}',
                    'url' => '/order/view',
                ],
            ]),
            self::template('notice', [
                'name' => 'Next prayer',
                'seconds' => 8,
                'weight' => 1,
                'fields' => [
                    'title' => 'Next prayer',
                    'body' => '{{next_prayer}} · {{current_time}}',
                ],
            ]),
        ];
    }

    /**
     * @param  array<string, mixed>  $opts
     * @return array<string, mixed>
     */
    public static function template(string $key, array $opts = []): array
    {
        $fields = is_array($opts['fields'] ?? null) ? $opts['fields'] : [];
        $base = [
            'id' => self::id($opts['id'] ?? null),
            'name' => (string) ($opts['name'] ?? ucfirst(str_replace('_', ' ', $key))),
            'seconds' => (int) ($opts['seconds'] ?? 12),
            'weight' => (int) ($opts['weight'] ?? 1),
            'transition' => (string) ($opts['transition'] ?? 'fade'),
            'transition_ms' => (int) ($opts['transition_ms'] ?? 700),
            'background' => $opts['background'] ?? [
                'type' => 'solid',
                'value' => $key === 'brand_card' ? '#0d0a07' : '#1C1408',
                'opacity' => 1,
            ],
            'template_origin' => $key,
            'elements' => [],
        ];

        $base['elements'] = match ($key) {
            'hero' => [
                self::el('text', 6, 28, 88, 14, [
                    'text' => (string) ($fields['eyebrow'] ?? 'Bake & Grill'),
                    'style' => ['fontSize' => 3.2, 'fontWeight' => 700, 'color' => '#D4813A', 'letterSpacing' => 0.12, 'textTransform' => 'uppercase'],
                    'animation' => ['entrance' => 'fade', 'duration' => 700, 'delay' => 100],
                ]),
                self::el('text', 6, 40, 88, 18, [
                    'text' => (string) ($fields['title'] ?? '{{branch_name}}'),
                    'style' => ['fontSize' => 8, 'fontWeight' => 800, 'color' => '#FFF8F0', 'fontFamily' => 'display'],
                    'animation' => ['entrance' => 'rise', 'duration' => 800, 'delay' => 200],
                ]),
                self::el('text', 6, 60, 70, 10, [
                    'text' => (string) ($fields['subtitle'] ?? 'Authentic Dhivehi cuisine'),
                    'style' => ['fontSize' => 3.6, 'fontWeight' => 500, 'color' => '#C4B5A5'],
                    'animation' => ['entrance' => 'fade', 'duration' => 700, 'delay' => 350],
                ]),
                self::el('logo', 78, 8, 16, 14, [
                    'animation' => ['entrance' => 'fade', 'duration' => 600],
                ]),
                self::el('clock', 78, 84, 16, 8, [
                    'style' => ['fontSize' => 2.8, 'color' => '#C4B5A5', 'textAlign' => 'right'],
                ]),
            ],
            'menu_grid' => [
                self::el('text', 4, 4, 60, 8, [
                    'text' => (string) ($fields['title'] ?? 'Menu'),
                    'style' => ['fontSize' => 4.5, 'fontWeight' => 800, 'color' => '#FFF8F0'],
                ]),
                self::el('menu_list', 4, 14, 92, 78, [
                    'binding' => ['type' => 'category', 'category_id' => $fields['category_id'] ?? null, 'limit' => 12],
                    'style' => ['fontSize' => 2.8, 'color' => '#FFF8F0', 'columns' => 2],
                ]),
                self::el('logo', 86, 3, 10, 10, []),
            ],
            'promotion' => [
                self::el('shape', 0, 0, 100, 100, [
                    'style' => ['fill' => 'linear-gradient(135deg,#D4813A,#8B4513)', 'opacity' => 1],
                ]),
                self::el('text', 8, 30, 84, 16, [
                    'text' => (string) ($fields['title'] ?? '{{promotion_name}}'),
                    'style' => ['fontSize' => 7, 'fontWeight' => 800, 'color' => '#fff', 'textAlign' => 'center'],
                    'animation' => ['entrance' => 'zoom-in', 'emphasis' => 'pulse', 'duration' => 700],
                ]),
                self::el('text', 10, 52, 80, 12, [
                    'text' => (string) ($fields['subtitle'] ?? ''),
                    'style' => ['fontSize' => 3.5, 'color' => '#FFF8F0', 'textAlign' => 'center'],
                ]),
            ],
            'qr' => [
                self::el('text', 8, 18, 50, 12, [
                    'text' => (string) ($fields['title'] ?? 'Scan for menu'),
                    'style' => ['fontSize' => 5, 'fontWeight' => 800, 'color' => '#FFF8F0'],
                ]),
                self::el('text', 8, 34, 50, 10, [
                    'text' => (string) ($fields['subtitle'] ?? ''),
                    'style' => ['fontSize' => 2.8, 'color' => '#C4B5A5'],
                ]),
                self::el('qr', 62, 22, 30, 50, [
                    'binding' => ['url' => (string) ($fields['url'] ?? '/order/view')],
                    'style' => ['background' => '#fff', 'padding' => 2],
                ]),
            ],
            'notice' => [
                self::el('text', 8, 30, 84, 14, [
                    'text' => (string) ($fields['title'] ?? 'Notice'),
                    'style' => ['fontSize' => 6, 'fontWeight' => 800, 'color' => '#D4813A', 'textAlign' => 'center'],
                ]),
                self::el('text', 10, 48, 80, 20, [
                    'text' => (string) ($fields['body'] ?? ''),
                    'style' => ['fontSize' => 3.8, 'color' => '#FFF8F0', 'textAlign' => 'center'],
                ]),
            ],
            'video' => [
                self::el('video', 0, 0, 100, 100, [
                    'binding' => ['url' => (string) ($fields['url'] ?? '')],
                    'style' => ['objectFit' => 'cover'],
                ]),
            ],
            'split' => [
                self::el('image', 0, 0, 50, 100, [
                    'binding' => ['url' => (string) ($fields['image'] ?? '')],
                    'animation' => ['emphasis' => 'ken-burns', 'duration' => 12000],
                ]),
                self::el('text', 54, 30, 42, 16, [
                    'text' => (string) ($fields['title'] ?? ''),
                    'style' => ['fontSize' => 5.5, 'fontWeight' => 800, 'color' => '#FFF8F0'],
                ]),
                self::el('text', 54, 50, 42, 20, [
                    'text' => (string) ($fields['body'] ?? ''),
                    'style' => ['fontSize' => 3, 'color' => '#C4B5A5'],
                ]),
            ],
            'full_screen' => [
                self::el('image', 0, 0, 100, 100, [
                    'binding' => ['url' => (string) ($fields['image'] ?? '')],
                    'animation' => ['emphasis' => 'ken-burns', 'duration' => 14000],
                ]),
                self::el('text', 6, 78, 88, 12, [
                    'text' => (string) ($fields['title'] ?? ''),
                    'style' => ['fontSize' => 5, 'fontWeight' => 800, 'color' => '#fff', 'textShadow' => '0 2px 12px rgba(0,0,0,.5)'],
                ]),
            ],
            // Placeholder entry — the player expands this into generated slides
            // (see packages/shared/src/signage/autoSlides.ts). The binding carries
            // the tuning knobs; the text only ever shows if the menu is empty.
            'auto_menu' => [
                self::el('text', 8, 40, 84, 14, [
                    'text' => (string) ($fields['title'] ?? 'Our menu'),
                    'style' => ['fontSize' => 6, 'fontWeight' => 800, 'color' => '#FFF8F0', 'textAlign' => 'center'],
                    'binding' => [
                        'showcase_cap' => (int) ($fields['showcase_cap'] ?? 12),
                        'rows_per_slide' => (int) ($fields['rows_per_slide'] ?? 14),
                        'showcase_seconds' => (int) ($fields['showcase_seconds'] ?? 10),
                        'category_seconds' => (int) ($fields['category_seconds'] ?? 14),
                        'show_thumbs' => (bool) ($fields['show_thumbs'] ?? false),
                    ],
                ]),
            ],
            // Idle / brand card — also the empty-playlist fallback on the TV player.
            'brand_card' => [
                self::el('logo', 30, 14, 40, 26, [
                    'style' => ['objectFit' => 'contain'],
                    'animation' => ['entrance' => 'fade', 'duration' => 700],
                ]),
                self::el('text', 8, 46, 84, 12, [
                    'text' => (string) ($fields['title'] ?? '{{branch_name}}'),
                    'style' => [
                        'fontSize' => 6,
                        'fontWeight' => 800,
                        'color' => '#FFF8F0',
                        'textAlign' => 'center',
                        'fontFamily' => 'display',
                    ],
                    'animation' => ['entrance' => 'fade', 'duration' => 700, 'delay' => 80],
                ]),
                self::el('text', 8, 60, 84, 8, [
                    'text' => (string) ($fields['phone'] ?? '{{business_phone}}'),
                    'style' => [
                        'fontSize' => 3.2,
                        'fontWeight' => 600,
                        'color' => '#C4B5A5',
                        'textAlign' => 'center',
                    ],
                    'animation' => ['entrance' => 'fade', 'duration' => 700, 'delay' => 140],
                ]),
                self::el('text', 8, 70, 84, 8, [
                    'text' => (string) ($fields['website'] ?? '{{business_website}}'),
                    'style' => [
                        'fontSize' => 2.8,
                        'fontWeight' => 500,
                        'color' => '#D4813A',
                        'textAlign' => 'center',
                    ],
                    'animation' => ['entrance' => 'fade', 'duration' => 700, 'delay' => 200],
                ]),
            ],
            'blank' => [],
            default => [],
        };

        return $base;
    }

    /**
     * @param  array<string, mixed>  $opts
     * @return array<string, mixed>
     */
    public static function smartSlide(string $smartType, array $opts = []): array
    {
        $slide = self::template('menu_grid', array_merge($opts, [
            'fields' => ['title' => $opts['name'] ?? ucfirst($smartType)],
        ]));
        $slide['template_origin'] = 'smart:' . $smartType;
        $slide['smart_type'] = $smartType;
        // Replace menu_list binding with smart binding
        foreach ($slide['elements'] as &$el) {
            if (($el['type'] ?? '') === 'menu_list') {
                $el['binding'] = ['type' => 'smart', 'smart_type' => $smartType, 'limit' => 10];
            }
        }
        unset($el);

        return $slide;
    }

    /**
     * @param  array<string, mixed>  $opts  title, body, title_dv, body_dv, layout, reopen_at
     * @return array<string, mixed>
     */
    public static function emergencySlide(string $mode, array $opts = []): array
    {
        $defaults = SignageEmergencyNormalizer::defaultCopyForMode($mode);
        $title = (string) ($opts['title'] ?? $defaults['title']);
        $body = (string) ($opts['body'] ?? $defaults['body']);
        $titleDv = (string) ($opts['title_dv'] ?? '');
        $bodyDv = (string) ($opts['body_dv'] ?? '');
        $layout = (string) ($opts['layout'] ?? SignageEmergencyNormalizer::defaultLayoutForMode($mode));
        if (! in_array($layout, SignageEmergencyNormalizer::LAYOUTS, true)) {
            $layout = SignageEmergencyNormalizer::defaultLayoutForMode($mode);
        }
        $reopenAt = isset($opts['reopen_at']) && is_string($opts['reopen_at']) ? $opts['reopen_at'] : null;

        $isFireAlarm = $mode === 'fire_alarm';
        $background = $isFireAlarm || $layout === 'alert'
            ? ['type' => 'solid', 'value' => '#B91C1C', 'opacity' => 1]
            : ['type' => 'solid', 'value' => '#1C1408', 'opacity' => 1];

        $slide = [
            'id' => self::id($opts['id'] ?? null),
            'name' => 'Emergency: ' . $mode,
            'seconds' => 60,
            'weight' => 1,
            'transition' => 'fade',
            'transition_ms' => 700,
            'background' => $background,
            'template_origin' => 'emergency:' . $mode,
            'emergency_layout' => $layout,
            'elements' => self::emergencyElements($layout, $title, $body, $titleDv, $bodyDv, $reopenAt, $isFireAlarm),
        ];

        return $slide;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function emergencyElements(
        string $layout,
        string $title,
        string $body,
        string $titleDv,
        string $bodyDv,
        ?string $reopenAt,
        bool $isFireAlarm,
    ): array {
        $elements = [];

        if ($layout === 'alert') {
            $elements[] = self::el('shape', 0, 0, 100, 100, [
                'style' => ['fill' => '#B91C1C', 'opacity' => 1],
                'binding' => ['testId' => 'emergency-alert-bg'],
            ]);
            $elements[] = self::el('text', 6, 28, 88, 22, [
                'text' => $title,
                'style' => [
                    'fontSize' => 9,
                    'fontWeight' => 900,
                    'color' => '#FFFFFF',
                    'textAlign' => 'center',
                    'textTransform' => 'uppercase',
                ],
                'binding' => ['testId' => 'emergency-alert-title'],
            ]);
            if ($body !== '') {
                $elements[] = self::el('text', 8, 54, 84, 16, [
                    'text' => $body,
                    'style' => ['fontSize' => 4.2, 'fontWeight' => 600, 'color' => '#FEE2E2', 'textAlign' => 'center'],
                    'binding' => ['testId' => 'emergency-alert-body'],
                ]);
            }
        } elseif ($layout === 'split') {
            $elements[] = self::el('logo', 6, 28, 28, 44, [
                'style' => ['objectFit' => 'contain'],
            ]);
            $elements[] = self::el('text', 38, 28, 56, 14, [
                'text' => $title,
                'style' => ['fontSize' => 5.5, 'fontWeight' => 800, 'color' => '#D4813A'],
            ]);
            $elements[] = self::el('text', 38, 46, 56, 22, [
                'text' => $body,
                'style' => ['fontSize' => 3.5, 'color' => '#FFF8F0'],
            ]);
        } elseif ($layout === 'countdown') {
            $elements[] = self::el('text', 8, 22, 84, 14, [
                'text' => $title,
                'style' => ['fontSize' => 6, 'fontWeight' => 800, 'color' => '#D4813A', 'textAlign' => 'center'],
            ]);
            if ($body !== '') {
                $elements[] = self::el('text', 10, 38, 80, 12, [
                    'text' => $body,
                    'style' => ['fontSize' => 3.6, 'color' => '#FFF8F0', 'textAlign' => 'center'],
                ]);
            }
            $elements[] = self::el('text', 20, 54, 60, 18, [
                'text' => '',
                'binding' => [
                    'type' => 'countdown',
                    'reopen_at' => $reopenAt ?? '',
                    'testId' => 'emergency-countdown',
                ],
                'style' => ['fontSize' => 7, 'fontWeight' => 800, 'color' => '#FFF8F0', 'textAlign' => 'center'],
            ]);
        } else {
            // notice — centered title/body (legacy default)
            $elements[] = self::el('text', 8, 30, 84, 14, [
                'text' => $title,
                'style' => ['fontSize' => 6, 'fontWeight' => 800, 'color' => '#D4813A', 'textAlign' => 'center'],
            ]);
            if ($body !== '') {
                $elements[] = self::el('text', 10, 48, 80, 20, [
                    'text' => $body,
                    'style' => ['fontSize' => 3.8, 'color' => '#FFF8F0', 'textAlign' => 'center'],
                ]);
            }
            if (! $isFireAlarm && $layout === 'notice') {
                $elements[] = self::el('logo', 78, 8, 16, 14, [
                    'animation' => ['entrance' => 'fade', 'duration' => 600],
                ]);
            }
        }

        if ($titleDv !== '') {
            $elements[] = self::el('text', 8, 72, 84, 10, [
                'text' => $titleDv,
                'style' => [
                    'fontSize' => 4.5,
                    'fontWeight' => 700,
                    'color' => '#D4813A',
                    'textAlign' => 'center',
                    'lang' => 'dv',
                    'dir' => 'rtl',
                ],
            ]);
        }
        if ($bodyDv !== '') {
            $elements[] = self::el('text', 10, 82, 80, 12, [
                'text' => $bodyDv,
                'style' => [
                    'fontSize' => 3.4,
                    'color' => '#FFF8F0',
                    'textAlign' => 'center',
                    'lang' => 'dv',
                    'dir' => 'rtl',
                ],
            ]);
        }

        return $elements;
    }

    /**
     * @return list<array{key: string, label: string}>
     */
    public static function templateCatalog(): array
    {
        return [
            ['key' => 'hero', 'label' => 'Hero'],
            ['key' => 'menu_grid', 'label' => 'Menu grid'],
            ['key' => 'promotion', 'label' => 'Promotion'],
            ['key' => 'qr', 'label' => 'QR'],
            ['key' => 'notice', 'label' => 'Notice'],
            ['key' => 'video', 'label' => 'Video'],
            ['key' => 'split', 'label' => 'Split'],
            ['key' => 'full_screen', 'label' => 'Full screen'],
            ['key' => 'auto_menu', 'label' => 'Auto · Full menu'],
            ['key' => 'brand_card', 'label' => 'Brand card'],
            ['key' => 'blank', 'label' => 'Blank'],
            ['key' => 'smart:offers', 'label' => 'Smart · Offers'],
            ['key' => 'smart:todays_special', 'label' => "Smart · Today's special"],
            ['key' => 'smart:new', 'label' => 'Smart · New items'],
            ['key' => 'smart:bestsellers', 'label' => 'Smart · Bestsellers'],
            ['key' => 'smart:chef_recommendation', 'label' => 'Smart · Chef pick'],
            ['key' => 'smart:combos', 'label' => 'Smart · Combos'],
            ['key' => 'smart:category_highlight', 'label' => 'Smart · Category'],
            ['key' => 'smart:featured_product', 'label' => 'Smart · Featured'],
        ];
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private static function el(string $type, float $x, float $y, float $w, float $h, array $extra = []): array
    {
        return array_merge([
            'id' => self::id(),
            'type' => $type,
            'x' => $x,
            'y' => $y,
            'w' => $w,
            'h' => $h,
            'rotation' => 0,
            'z' => 1,
            'style' => [],
            'animation' => [],
            'binding' => [],
        ], $extra);
    }

    private static function id(?string $force = null): string
    {
        if (is_string($force) && $force !== '') {
            return $force;
        }

        return substr(bin2hex(random_bytes(8)), 0, 12);
    }
}
