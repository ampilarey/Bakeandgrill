<?php

declare(strict_types=1);

namespace Tests\Unit;

use Tests\TestCase;

/**
 * A route like `/suppliers/{id}` will happily match `/suppliers/performance`
 * if it is registered first, and the handler then looks up a supplier called
 * "performance" — which is what the Purchasing → Suppliers page showed the
 * owner on 2026-09-07 ("No query results for model [App\Models\Supplier]
 * performance"). Domain route files are required in a fixed order, so a
 * static route added to a file loaded later is invisible.
 *
 * The fix each time is `->whereNumber('id')` on the parameterised route. This
 * test finds the collisions instead of waiting for a page to break.
 */
class RouteShadowingTest extends TestCase
{
    public function test_no_static_route_is_swallowed_by_an_earlier_parameterised_one(): void
    {
        $routes = [];
        foreach (app('router')->getRoutes()->getRoutes() as $order => $route) {
            foreach ($route->methods() as $method) {
                if (in_array($method, ['HEAD', 'OPTIONS'], true)) {
                    continue;
                }
                $routes[] = ['order' => $order, 'method' => $method, 'uri' => $route->uri(), 'wheres' => $route->wheres];
            }
        }

        $shadowed = [];
        foreach ($routes as $static) {
            if (str_contains($static['uri'], '{')) {
                continue;
            }
            foreach ($routes as $dynamic) {
                if ($dynamic['order'] >= $static['order']
                    || $dynamic['method'] !== $static['method']
                    || !str_contains($dynamic['uri'], '{')) {
                    continue;
                }
                $pattern = preg_replace('#\\\\\{[^}]+\\\\\}#', '([^/]+)', preg_quote($dynamic['uri'], '#'));
                if (!preg_match('#^' . $pattern . '$#', $static['uri'], $captured)) {
                    continue;
                }

                // A `where` constraint that rejects the literal segment (the
                // usual whereNumber) means the static route is safe.
                preg_match_all('/\{([^}?]+)\??\}/', $dynamic['uri'], $names);
                $blocked = false;
                foreach ($names[1] as $i => $name) {
                    $value = $captured[$i + 1] ?? '';
                    if (isset($dynamic['wheres'][$name]) && !preg_match('#^' . $dynamic['wheres'][$name] . '$#', $value)) {
                        $blocked = true;
                        break;
                    }
                }
                if (!$blocked) {
                    $shadowed[] = "{$static['method']} /{$static['uri']} is matched first by /{$dynamic['uri']}";
                    break;
                }
            }
        }

        $this->assertSame([], array_values(array_unique($shadowed)), implode("\n", array_unique($shadowed))
            . "\n\nAdd a constraint (usually ->whereNumber('id')) to the parameterised route, "
            . 'or register the static route before it.');
    }
}
