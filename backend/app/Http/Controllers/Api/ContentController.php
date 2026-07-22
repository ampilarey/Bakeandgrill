<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Public content delivery (Stage 2). Admin write endpoints added in Stage 3.
 */
class ContentController extends Controller
{
    /**
     * GET /api/content?app=order_app|website
     */
    public function public(Request $request): JsonResponse
    {
        $app = (string) $request->query('app', 'order_app');
        if (!in_array($app, ContentRegistry::APPS, true)) {
            return response()->json([
                'message' => 'Invalid app. Use order_app or website.',
            ], 422);
        }

        $content = ContentResolver::for($app)->allPublic();

        return response()->json([
            'app' => $app,
            'content' => $content,
            // Back-compat alias used by older clients expecting `settings`
            'settings' => $content,
        ]);
    }
}
