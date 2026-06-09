<?php

declare(strict_types=1);

namespace Tests\Feature\Printing;

use App\Domains\Printing\Services\PrintJobService;
use App\Models\Order;
use App\Models\Printer;
use App\Models\PrintJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PrintJobIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    public function test_duplicate_kitchen_dispatch_uses_single_print_job(): void
    {
        $printer = Printer::create([
            'name' => 'Kitchen 1',
            'type' => 'kitchen',
            'ip_address' => '192.168.1.50',
            'port' => 9100,
            'is_active' => true,
        ]);

        $order = Order::create([
            'order_number' => 'PRINT-IDEM-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 10,
            'total_laar' => 1000,
        ]);

        $service = app(PrintJobService::class);
        $service->dispatchKitchen($order);
        $service->dispatchKitchen($order->fresh());

        $key = 'kitchen:' . $order->id . ':' . $printer->id;
        $this->assertSame(1, PrintJob::where('idempotency_key', $key)->count());
    }
}
