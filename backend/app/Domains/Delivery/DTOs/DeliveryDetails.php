<?php

declare(strict_types=1);

namespace App\Domains\Delivery\DTOs;

final readonly class DeliveryDetails
{
    public function __construct(
        public string $addressLine1,
        public ?string $addressLine2,
        public string $island,
        public string $contactName,
        public string $contactPhone,
        public ?string $notes,
        public ?string $desiredEta,
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            addressLine1: $data['delivery_address_line1'],
            addressLine2: $data['delivery_address_line2'] ?? null,
            island: $data['delivery_island'],
            contactName: $data['delivery_contact_name'],
            contactPhone: $data['delivery_contact_phone'],
            notes: $data['delivery_notes'] ?? null,
            desiredEta: $data['desired_eta'] ?? null,
        );
    }

    public function toArray(): array
    {
        return [
            'delivery_address_line1' => $this->addressLine1,
            'delivery_address_line2' => $this->addressLine2,
            'delivery_island' => $this->island,
            'delivery_contact_name' => $this->contactName,
            'delivery_contact_phone' => $this->contactPhone,
            'delivery_notes' => $this->notes,
            'delivery_eta_at' => $this->desiredEta ? now()->parse($this->desiredEta) : null,
        ];
    }
}
