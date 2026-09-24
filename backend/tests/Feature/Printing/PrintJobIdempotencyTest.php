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

    public function test_duplicate_enqueue_kitchen_uses_single_print_job(): void
    {
        $printer = Printer::create([
            'name' => 'Kitchen 2',
            'type' => 'kitchen',
            'ip_address' => '192.168.1.51',
            'port' => 9100,
            'is_active' => true,
        ]);

        $order = Order::create([
            'order_number' => 'PRINT-ENQ-1',
            'type' => 'takeaway',
            'status' => 'pending',
            'subtotal' => 10,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total' => 10,
            'total_laar' => 1000,
        ]);

        // Kitchen audit, 2026-09-26: a reprint asked for twice prints twice
        // (the second used to find the first job and print nothing). Only a
        // double tap inside the same second collapses.
        \Illuminate\Support\Carbon::setTestNow('2026-09-26 12:00:00');
        $service = app(PrintJobService::class);
        $service->enqueueKitchen($order, 'resume_reprint');
        $service->enqueueKitchen($order->fresh(), 'resume_reprint');
        $this->assertSame(1, PrintJob::where('printer_id', $printer->id)->where('idempotency_key', 'like', '%:resume_reprint:%')->count());

        \Illuminate\Support\Carbon::setTestNow('2026-09-26 12:00:05');
        $service->enqueueKitchen($order->fresh(), 'resume_reprint');
        $this->assertSame(2, PrintJob::where('printer_id', $printer->id)->where('idempotency_key', 'like', '%:resume_reprint:%')->count());
        \Illuminate\Support\Carbon::setTestNow();
    }
}
