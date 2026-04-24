<?php

declare(strict_types=1);

namespace App\Domains\Shared\Support;

use App\Domains\Shared\Exceptions\InvalidTransitionException;
use Illuminate\Database\Eloquent\Model;

/**
 * Simple state machine base class.
 *
 * Concrete state machines define $transitions as:
 *   ['from_status' => ['allowed_to_status', ...], ...]
 *
 * Usage:
 *   OrderStateMachine::for($order)->transition('completed');
 */
abstract class StateMachine
{
    abstract protected function transitions(): array;

    abstract protected function statusField(): string;

    public function __construct(protected Model $model) {}

    public static function for(Model $model): static
    {
        return new static($model);
    }

    public function can(string $to): bool
    {
        $from = $this->model->{$this->statusField()};
        $allowed = $this->transitions()[$from] ?? [];

        return in_array($to, $allowed, true);
    }

    public function transition(string $to, array $additionalAttributes = []): void
    {
        $from = $this->model->{$this->statusField()};

        if (!$this->can($to)) {
            throw new InvalidTransitionException(
                sprintf(
                    '%s cannot transition from [%s] to [%s].',
                    class_basename($this->model),
                    $from ?? 'null',
                    $to,
                ),
            );
        }

        $this->model->update(array_merge(
            [$this->statusField() => $to],
            $additionalAttributes,
        ));
    }
}
