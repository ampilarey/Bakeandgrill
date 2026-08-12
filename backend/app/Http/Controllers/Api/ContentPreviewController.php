<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Content\Blocks\PageLayoutDraftBlocks;
use App\Domains\Content\ContentDraftStore;
use App\Domains\Content\ContentRegistry;
use App\Domains\Content\ContentResolver;
use App\Http\Controllers\Controller;
use App\Models\PageBlock;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;

class ContentPreviewController extends Controller
{
    /**
     * Create a short-lived draft preview token (staff only).
     *
     * `include_layout: true` also merges the staff user's unpublished Home
     * layout draft (PageLayoutDraft) for this app into
     * overrides['page_blocks'][app]['home'] so the preview shows both the
     * content-key edits and the in-progress layout — same overlay shape
     * DraftPageBlockHydrator reads in layout.blade.php / home.blade.php.
     */
    public function createToken(Request $request): JsonResponse
    {
        $data = $request->validate([
            'app' => ['required', 'string', Rule::in(ContentRegistry::APPS)],
            'locale' => ['sometimes', 'string', Rule::in(ContentRegistry::LOCALES)],
            'overrides' => ['required', 'array'],
            'overrides.*' => ['nullable', 'string'],
            'include_layout' => ['sometimes', 'boolean'],
        ]);

        $locale = $data['locale'] ?? 'en';
        $overrides = $data['overrides'];

        if (($data['include_layout'] ?? false) === true) {
            $user = $request->user();
            if ($user instanceof User) {
                $page = PageBlock::PAGE_HOME;
                $layoutBlocks = PageLayoutDraftBlocks::forUser($user->id, $data['app'], $page);
                if (is_array($layoutBlocks)) {
                    $overrides['page_blocks'][$data['app']][$page] = $layoutBlocks;
                }
            }
        }

        $token = ContentDraftStore::put($data['app'], $locale, $overrides);

        $websiteUrl = URL::temporarySignedRoute(
            'content.preview.website',
            now()->addMinutes(15),
            ['token' => $token],
        );

        $orderBase = rtrim((string) config('app.url'), '/') . '/order';
        $orderUrl = $orderBase . '/?previewToken=' . urlencode($token);

        return response()->json([
            'token' => $token,
            'expires_in' => 900,
            'website_url' => $websiteUrl,
            'order_app_url' => $orderUrl,
        ]);
    }

    /**
     * Public JSON for order-app preview mode — requires valid draft token.
     */
    public function draftContent(Request $request): JsonResponse
    {
        $token = (string) $request->query('token', '');
        $draft = ContentDraftStore::get($token);
        if (!$draft) {
            return response()->json(['message' => 'Invalid or expired preview token.'], 403);
        }

        $app = $draft['app'];
        $locale = $draft['locale'] ?? 'en';
        $base = ContentResolver::for($app, $locale)->allPublic();
        foreach ($draft['overrides'] as $key => $value) {
            if (is_string($key)) {
                $base[$key] = (string) ($value ?? '');
            }
        }

        return response()->json([
            'app' => $app,
            'locale' => $locale,
            'preview' => true,
            'content' => $base,
        ]);
    }
}
