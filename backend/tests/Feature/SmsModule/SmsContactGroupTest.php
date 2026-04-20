<?php

declare(strict_types=1);

namespace Tests\Feature\SmsModule;

use App\Domains\Sms\Services\SmsContactResolver;
use App\Models\SmsContact;
use App\Models\SmsContactGroup;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SmsContactGroupTest extends TestCase
{
    use RefreshDatabase;

    private SmsContactResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = app(SmsContactResolver::class);
    }

    private function makeContact(array $attrs = []): SmsContact
    {
        return SmsContact::create(array_merge([
            'name'       => 'Test Contact',
            'phone'      => '+9607111111',
            'type'       => 'external',
            'is_enabled' => true,
        ], $attrs));
    }

    private function makeGroup(): SmsContactGroup
    {
        return SmsContactGroup::create([
            'name'       => 'Test Group',
            'slug'       => 'test-group-' . uniqid(),
            'is_enabled' => true,
        ]);
    }

    /** Active contact during active window returns phone */
    public function test_resolves_active_contact_in_time_window(): void
    {
        $contact = $this->makeContact([
            'active_from'  => '08:00',
            'active_until' => '18:00',
            'active_days'  => ['mon', 'tue', 'wed', 'thu', 'fri'],
        ]);

        $at = Carbon::parse('next Monday 10:00:00');
        $phone = $this->resolver->resolveForContact($contact, $at);

        $this->assertSame('+9607111111', $phone);
    }

    /** Contact outside active time window returns null */
    public function test_returns_null_outside_time_window(): void
    {
        $contact = $this->makeContact([
            'active_from'  => '08:00',
            'active_until' => '18:00',
        ]);

        $at = Carbon::parse('next Monday 20:00:00');
        $phone = $this->resolver->resolveForContact($contact, $at);

        $this->assertNull($phone);
    }

    /** Disabled contact returns null */
    public function test_disabled_contact_returns_null(): void
    {
        $contact = $this->makeContact(['is_enabled' => false]);
        $phone = $this->resolver->resolveForContact($contact, Carbon::now());

        $this->assertNull($phone);
    }

    /** Contact not active on this weekday returns null */
    public function test_contact_wrong_day_returns_null(): void
    {
        $contact = $this->makeContact([
            'active_days' => ['sat', 'sun'],
        ]);

        $monday = Carbon::parse('next Monday');
        $phone = $this->resolver->resolveForContact($contact, $monday);

        $this->assertNull($phone);
    }

    /** Group resolves all active members */
    public function test_group_resolves_active_members(): void
    {
        $group = $this->makeGroup();
        $c1 = $this->makeContact(['phone' => '+9607111001']);
        $c2 = $this->makeContact(['phone' => '+9607111002', 'is_enabled' => false]);
        $c3 = $this->makeContact(['phone' => '+9607111003']);

        $group->contacts()->attach([$c1->id, $c2->id, $c3->id]);

        $phones = $this->resolver->resolveForGroup($group, Carbon::now());

        $this->assertCount(2, $phones);
        $this->assertContains('+9607111001', $phones->all());
        $this->assertContains('+9607111003', $phones->all());
        $this->assertNotContains('+9607111002', $phones->all());
    }

    /** Disabled group returns empty collection */
    public function test_disabled_group_returns_empty(): void
    {
        $group = SmsContactGroup::create([
            'name'       => 'Disabled Group',
            'slug'       => 'disabled-group',
            'is_enabled' => false,
        ]);
        $c1 = $this->makeContact();
        $group->contacts()->attach($c1->id);

        $phones = $this->resolver->resolveForGroup($group, Carbon::now());

        $this->assertCount(0, $phones);
    }

    /** Adding and removing members works via pivot */
    public function test_add_and_remove_group_member(): void
    {
        $group = $this->makeGroup();
        $contact = $this->makeContact();

        $group->contacts()->attach($contact->id);
        $this->assertCount(1, $group->contacts()->get());

        $group->contacts()->detach($contact->id);
        $this->assertCount(0, $group->contacts()->get());
    }
}
