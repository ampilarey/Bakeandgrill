<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SmsContact;
use App\Models\SmsContactGroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class SmsContactGroupController extends Controller
{
    public function index(): JsonResponse
    {
        $groups = SmsContactGroup::withCount('contacts')
            ->with('contacts:id,name,phone,type,is_enabled')
            ->orderBy('name')
            ->get()
            ->map(fn (SmsContactGroup $g) => $this->format($g));

        return response()->json(['groups' => $groups]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'        => 'required|string|max:255',
            'description' => 'nullable|string|max:500',
            'is_enabled'  => 'boolean',
        ]);

        $data['slug'] = Str::slug($data['name']) . '-' . Str::random(4);

        $group = SmsContactGroup::create($data);
        $group->load('contacts');
        $group->loadCount('contacts');

        return response()->json(['group' => $this->format($group)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $group = SmsContactGroup::findOrFail($id);

        $data = $request->validate([
            'name'        => 'sometimes|string|max:255',
            'description' => 'nullable|string|max:500',
            'is_enabled'  => 'sometimes|boolean',
        ]);

        $group->update($data);
        $group->load('contacts');
        $group->loadCount('contacts');

        return response()->json(['group' => $this->format($group)]);
    }

    public function destroy(int $id): JsonResponse
    {
        SmsContactGroup::findOrFail($id)->delete();

        return response()->json(['message' => 'Group deleted.']);
    }

    /** POST /admin/sms/contact-groups/{id}/members */
    public function addMember(Request $request, int $id): JsonResponse
    {
        $group = SmsContactGroup::findOrFail($id);

        $data = $request->validate([
            'contact_id' => 'required|exists:sms_contacts,id',
        ]);

        $group->contacts()->syncWithoutDetaching([$data['contact_id']]);

        return response()->json(['message' => 'Member added.']);
    }

    /** DELETE /admin/sms/contact-groups/{id}/members/{contactId} */
    public function removeMember(int $id, int $contactId): JsonResponse
    {
        $group = SmsContactGroup::findOrFail($id);
        $group->contacts()->detach($contactId);

        return response()->json(['message' => 'Member removed.']);
    }

    private function format(SmsContactGroup $g): array
    {
        return [
            'id'             => $g->id,
            'name'           => $g->name,
            'slug'           => $g->slug,
            'description'    => $g->description,
            'is_enabled'     => $g->is_enabled,
            'contacts_count' => $g->contacts_count ?? $g->contacts->count(),
            'contacts'       => $g->relationLoaded('contacts')
                ? $g->contacts->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'phone' => $c->phone, 'type' => $c->type])->values()
                : [],
            'created_at'     => $g->created_at?->toIso8601String(),
        ];
    }
}
