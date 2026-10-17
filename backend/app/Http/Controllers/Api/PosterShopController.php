<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domains\Posters\PosterOrders;
use App\Domains\Posters\PrintShopPrefs;
use App\Http\Controllers\Controller;
use App\Models\Poster;
use App\Models\PosterOrder;
use App\Models\SiteSetting;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Print shops and the orders sent to them (docs/POSTER_PLAN.md § 9).
 * Making an order needs posters.make. Shops, proofs and quotes need posters.manage.
 */
class PosterShopController extends Controller
{
    public function shops(): JsonResponse
    {
        $shops = Supplier::query()->where('kind', 'print_shop')->orderBy('name')->get()
            ->map(fn (Supplier $shop) => $this->shop($shop));

        return response()->json([
            'shops' => $shops,
            'proof_approval' => PosterOrders::proofRequired(),
        ]);
    }

    public function storeShop(Request $request): JsonResponse
    {
        $this->managed($request);
        $data = $this->shopInput($request);
        $shop = Supplier::query()->create([
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'kind' => 'print_shop',
            'is_active' => true,
            'print_prefs' => PrintShopPrefs::normalize($data['print_prefs'] ?? null),
        ]);

        return response()->json($this->shop($shop), 201);
    }

    public function updateShop(Request $request, Supplier $supplier): JsonResponse
    {
        $this->managed($request);
        abort_unless($supplier->kind === 'print_shop', 404);
        $data = $this->shopInput($request, partial: true);
        if (array_key_exists('print_prefs', $data)) {
            $data['print_prefs'] = PrintShopPrefs::normalize(is_array($data['print_prefs']) ? $data['print_prefs'] : null);
        }
        $supplier->fill($data)->save();

        return response()->json($this->shop($supplier));
    }

    public function setProofApproval(Request $request): JsonResponse
    {
        $this->managed($request);
        $on = (bool) $request->validate(['on' => ['required', 'boolean']])['on'];
        SiteSetting::set(PosterOrders::PROOF_SETTING, $on ? 'true' : 'false');

        return response()->json(['proof_approval' => $on]);
    }

    public function orders(): JsonResponse
    {
        $rows = PosterOrder::query()->with(['poster', 'shop', 'export'])->orderByDesc('id')->limit(100)->get()
            ->map(fn (PosterOrder $order) => $this->order($order));

        return response()->json(['orders' => $rows]);
    }

    public function send(Request $request, Poster $poster): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer'],
            'material' => ['nullable', 'string'],
            'finish' => ['nullable', 'string'],
            'gloss' => ['nullable', 'string'],
            'white' => ['nullable', 'string'],
            'mounting' => ['nullable', 'string'],
            'imposition' => ['nullable', 'string'],
            'masks' => ['nullable', 'boolean'],
            'mirror' => ['nullable', 'boolean'],
            'deadline' => ['nullable', 'date'],
            'sizes' => ['nullable', 'array'],
            'quantity' => ['nullable', 'array'],
        ]);
        $shop = Supplier::query()->find($data['supplier_id']);
        if ($shop === null) {
            return response()->json(['message' => 'Choose a print shop.'], 422);
        }
        try {
            $order = PosterOrders::send($poster, $shop, $data, $request->user()?->id);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
        $payload = $this->order($order->load('poster', 'shop', 'export'));
        // The proof link once the file is ready (with a running queue worker, that is a minute later:
        // the owner then gets it in the proof alert).
        if ($order->state === 'draft' && PosterOrders::proofRequired() && $order->export?->status === 'ready') {
            $payload['proof_url'] = PosterOrders::proofLink($order);
        }

        return response()->json($payload, 201);
    }

    public function quote(Request $request, PosterOrder $order): JsonResponse
    {
        $this->managed($request);
        $data = $request->validate([
            'quote_mvr' => ['required', 'numeric', 'min:0'],
            'quote_note' => ['nullable', 'string', 'max:200'],
        ]);
        try {
            $order = PosterOrders::quote($order, (float) $data['quote_mvr'], $data['quote_note'] ?? null, $request->user()?->id);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->order($order));
    }

    public function approveQuote(Request $request, PosterOrder $order): JsonResponse
    {
        $this->managed($request);
        try {
            $order = PosterOrders::approveQuote($order, $request->user()?->id);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->order($order->load('poster', 'shop')));
    }

    public function advance(Request $request, PosterOrder $order): JsonResponse
    {
        $state = (string) $request->validate(['state' => ['required', 'in:received,up,down']])['state'];
        try {
            $order = PosterOrders::advance($order, $state, $request->user()?->id);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($this->order($order->load('poster', 'shop')));
    }

    private function managed(Request $request): void
    {
        if (!$request->user()?->hasPermission('posters.manage')) {
            abort(403);
        }
    }

    /** @return array<string, mixed> */
    private function shopInput(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$req, 'string', 'max:160'],
            'email' => ['nullable', 'email', 'max:160'],
            'phone' => ['nullable', 'string', 'max:40'],
            'print_prefs' => ['nullable', 'array'],
            'print_prefs.layers' => ['nullable', 'in:masks,spots'],
            'print_prefs.white_name' => ['nullable', 'string', 'max:32'],
            'print_prefs.gloss_name' => ['nullable', 'string', 'max:32'],
            'print_prefs.bleed_mm' => ['nullable', 'integer'],
            'print_prefs.crop_marks' => ['nullable', 'boolean'],
        ]);
    }

    /** @return array<string, mixed> */
    private function shop(Supplier $shop): array
    {
        return [
            'id' => $shop->id,
            'name' => $shop->name,
            'email' => $shop->email,
            'phone' => $shop->phone,
            'print_prefs' => PrintShopPrefs::normalize(is_array($shop->print_prefs) ? $shop->print_prefs : null),
        ];
    }

    /** @return array<string, mixed> */
    private function order(PosterOrder $order): array
    {
        return [
            'id' => $order->id,
            'poster_id' => $order->poster_id,
            'code' => $order->poster?->code(),
            'poster_name' => $order->poster?->name,
            'shop' => $order->shop?->name,
            'supplier_id' => $order->supplier_id,
            'state' => $order->state,
            'material' => $order->material,
            'gloss' => $order->gloss,
            'white' => $order->white,
            'quote_mvr' => $order->quote_mvr,
            'expense_id' => $order->expense_id,
            'state_log' => $order->state_log,
            // The print file: queued, ready or failed (the file is made on the queue).
            'file' => $order->export?->status,
            'file_error' => $order->export?->error,
        ];
    }
}
