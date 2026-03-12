<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Invoice;
use Illuminate\Console\Command;

class MarkOverdueInvoices extends Command
{
    protected $signature   = 'invoices:mark-overdue';
    protected $description = 'Mark sent invoices past their due date as overdue';

    public function handle(): int
    {
        $count = Invoice::where('status', 'sent')
            ->whereNotNull('due_date')
            ->where('due_date', '<', now()->toDateString())
            ->update(['status' => 'overdue']);

        $this->info("Marked {$count} invoice(s) as overdue.");
        return 0;
    }
}
