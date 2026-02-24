<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domains\Orders\StateMachine\OrderStateMachine;
use App\Domains\Payments\StateMachine\PaymentStateMachine;
use App\Domains\Shared\Exceptions\InvalidTransitionException;
use Illuminate\Database\Eloquent\Model;
use Tests\TestCase;

class StateMachineTest extends TestCase
{
    private function makeModel(string $status): Model
    {
        $model = new class extends Model
        {
            protected $fillable = ['status'];

            protected $guarded = [];

            public $exists = true;

            protected $connection = 'sqlite';

            public function update(array $attributes = [], array $options = []): bool
            {
                foreach ($attributes as $k => $v) {
                    $this->$k = $v;
                }

                return true;
            }
        };
        $model->status = $status;

        return $model;
    }

    public function test_order_can_transition_pending_to_paid(): void
    {
        $order = $this->makeModel('pending');
        $sm = OrderStateMachine::for($order);
        $this->assertTrue($sm->can('paid'));
    }

    public function test_order_cannot_transition_paid_to_pending(): void
    {
        $order = $this->makeModel('paid');
        $sm = OrderStateMachine::for($order);
        $this->assertFalse($sm->can('pending'));
    }

    public function test_order_transition_throws_on_invalid(): void
    {
        $order = $this->makeModel('cancelled');
        $sm = OrderStateMachine::for($order);
        $this->expectException(InvalidTransitionException::class);
        $sm->transition('pending');
    }

    public function test_payment_confirmed_to_refunded(): void
    {
        $payment = $this->makeModel('confirmed');
        $sm = PaymentStateMachine::for($payment);
        $this->assertTrue($sm->can('refunded'));
    }

    public function test_payment_failed_is_terminal(): void
    {
        $payment = $this->makeModel('failed');
        $sm = PaymentStateMachine::for($payment);
        $this->assertFalse($sm->can('confirmed'));
        $this->assertFalse($sm->can('pending'));
    }
}
