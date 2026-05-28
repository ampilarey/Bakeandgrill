<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Services\CustomerAddressService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerAddressController extends Controller
{
    public function __construct(private CustomerAddressService $addresses) {}

    /** GET /api/customer/addresses */
    public function index(Request $request): JsonResponse
    {
        $customer = $this->requireCustomer($request);

        return response()->json([
            'addresses' => $this->addresses->listForCustomer($customer)
                ->map(fn (CustomerAddress $a) => $a->toApiArray())
                ->values(),
        ]);
    }

    /** POST /api/customer/addresses */
    public function store(Request $request): JsonResponse
    {
        $customer = $this->requireCustomer($request);
        $validated = $this->validatePayload($request);

        $address = $this->addresses->create($customer, $validated);

        return response()->json(['address' => $address->toApiArray()], 201);
    }

    /** PATCH /api/customer/addresses/{id} */
    public function update(Request $request, int $id): JsonResponse
    {
        $customer = $this->requireCustomer($request);
        $address = $this->findOwnedAddress($customer, $id);
        $validated = $this->validatePayload($request, true);

        $address = $this->addresses->update($address, $validated);

        return response()->json(['address' => $address->toApiArray()]);
    }

    /** DELETE /api/customer/addresses/{id} */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $customer = $this->requireCustomer($request);
        $address = $this->findOwnedAddress($customer, $id);
        $this->addresses->delete($address);

        return response()->json(['message' => 'Deleted.']);
    }

    /** POST /api/customer/addresses/{id}/default */
    public function setDefault(Request $request, int $id): JsonResponse
    {
        $customer = $this->requireCustomer($request);
        $address = $this->findOwnedAddress($customer, $id);
        $address = $this->addresses->setDefault($customer, $address);

        return response()->json(['address' => $address->toApiArray()]);
    }

    /** GET /api/customers/{id}/addresses — staff / POS */
    public function indexForCustomer(int $customerId): JsonResponse
    {
        $customer = Customer::query()->findOrFail($customerId);

        return response()->json([
            'addresses' => $this->addresses->listForCustomer($customer)
                ->map(fn (CustomerAddress $a) => $a->toApiArray())
                ->values(),
        ]);
    }

    private function requireCustomer(Request $request): Customer
    {
        $user = $request->user();
        if (!$user instanceof Customer || !$request->user()->tokenCan('customer')) {
            abort(403, 'Forbidden — customer access only.');
        }

        return $user;
    }

    private function findOwnedAddress(Customer $customer, int $id): CustomerAddress
    {
        return $customer->addresses()->whereKey($id)->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function validatePayload(Request $request, bool $partial = false): array
    {
        $rules = [
            'label' => ['nullable', 'string', 'max:60'],
            'address_line1' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'address_line2' => ['nullable', 'string', 'max:255'],
            'island' => [$partial ? 'sometimes' : 'required', 'string', 'max:100'],
            'contact_name' => [$partial ? 'sometimes' : 'required', 'string', 'max:100'],
            'contact_phone' => [$partial ? 'sometimes' : 'required', 'string', 'max:30', 'regex:/^(\+?960)?[379]\d{6}$/'],
            'notes' => ['nullable', 'string', 'max:500'],
            'location_link' => ['nullable', 'url', 'max:2048'],
            'is_default' => ['sometimes', 'boolean'],
        ];

        return $request->validate($rules);
    }
}
