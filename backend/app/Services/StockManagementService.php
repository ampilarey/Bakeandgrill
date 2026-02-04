<?php

namespace App\Services;

use App\Models\Item;
use App\Models\LowStockAlert;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class StockManagementService
{
    /**
     * Check if item has sufficient stock for quantity
     */
    public function checkStock(Item $item, int $quantity): bool
    {
        // Items that don't track stock are always available
        if (!$item->track_stock) {
            return true;
        }
        
        // Made to order items are always available
        if ($item->availability_type === 'made_to_order') {
            return true;
        }
        
        // Check actual stock
        return $item->stock_quantity >= $quantity;
    }

    /**
     * Deduct stock when order is placed
     */
    public function deductStock(Item $item, int $quantity): void
    {
        if (!$item->track_stock) {
            return;
        }
        
        DB::transaction(function () use ($item, $quantity) {
            $item->decrement('stock_quantity', $quantity);
            
            // Check if low stock alert needed
            if ($item->stock_quantity <= $item->low_stock_threshold) {
                $this->triggerLowStockAlert($item);
            }
        });
    }

    /**
     * Trigger low stock alert
     */
    public function triggerLowStockAlert(Item $item): void
    {
        // Check if alert already sent recently (within 24 hours)
        $recentAlert = LowStockAlert::where('item_id', $item->id)
            ->where('sent', true)
            ->where('created_at', '>=', now()->subHours(24))
            ->first();
            
        if ($recentAlert) {
            return; // Don't spam alerts
        }

        // Get managers and owners
        $recipients = User::whereHas('role', function($q) {
            $q->whereIn('slug', ['owner', 'admin', 'manager']);
        })->where('is_active', true)->get();

        $message = "LOW STOCK ALERT: {$item->name} is running low. Current stock: {$item->stock_quantity}. Threshold: {$item->low_stock_threshold}.";

        // Create alert
        $alert = LowStockAlert::create([
            'item_id' => $item->id,
            'stock_level' => $item->stock_quantity,
            'threshold' => $item->low_stock_threshold,
            'alert_type' => 'sms',
            'recipients' => $recipients->pluck('id')->toArray(),
            'message' => $message,
            'sent' => false,
        ]);

        // Send SMS to managers/owners
        $smsService = app(SmsService::class);
        foreach ($recipients as $user) {
            if ($user->phone) {
                try {
                    $smsService->send($user->phone, $message);
                } catch (\Exception $e) {
                    \Log::error('Failed to send low stock SMS', [
                        'user' => $user->id,
                        'item' => $item->id,
                        'error' => $e->getMessage()
                    ]);
                }
            }
        }

        $alert->update([
            'sent' => true,
            'sent_at' => now(),
        ]);
    }

    /**
     * Get item availability status with message
     */
    public function getAvailabilityStatus(Item $item): array
    {
        // Pre-order only items
        if ($item->availability_type === 'pre_order_only') {
            return [
                'available' => false,
                'can_pre_order' => true,
                'status' => 'pre_order_only',
                'message' => 'Pre-order only',
                'badge' => 'Pre-Order',
                'badge_color' => '#f39c12',
            ];
        }

        // Made to order items (always available)
        if ($item->availability_type === 'made_to_order') {
            return [
                'available' => true,
                'can_pre_order' => false,
                'status' => 'made_to_order',
                'message' => 'Made fresh upon order',
                'badge' => 'Made to Order',
                'badge_color' => '#27ae60',
            ];
        }

        // Stock-based availability
        if ($item->track_stock && $item->availability_type === 'stock_based') {
            if ($item->stock_quantity <= 0) {
                return [
                    'available' => false,
                    'can_pre_order' => $item->allow_pre_order,
                    'status' => 'out_of_stock',
                    'message' => $item->allow_pre_order ? 'Out of stock - Pre-order available' : 'Out of stock',
                    'badge' => 'Out of Stock',
                    'badge_color' => '#e74c3c',
                ];
            }
            
            if ($item->stock_quantity <= $item->low_stock_threshold) {
                return [
                    'available' => true,
                    'can_pre_order' => false,
                    'status' => 'low_stock',
                    'message' => "Only {$item->stock_quantity} left!",
                    'badge' => "Only {$item->stock_quantity} left",
                    'badge_color' => '#e67e22',
                ];
            }
        }

        // Always available
        return [
            'available' => true,
            'can_pre_order' => false,
            'status' => 'in_stock',
            'message' => null,
            'badge' => null,
            'badge_color' => null,
        ];
    }
}
