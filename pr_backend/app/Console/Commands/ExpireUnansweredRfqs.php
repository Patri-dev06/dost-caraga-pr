<?php

namespace App\Console\Commands;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Concerns\ManagesCanvass;
use App\Models\RfqSupplier;
use Illuminate\Console\Command;

/**
 * Flowchart: "Does supplier reply? No (after 7 calendar days) -> Cancel sent RFQ of Non-responding
 * Supplier -> Choose n of supplier". Runs hourly from the scheduler; Supply is notified to choose
 * the replacements.
 */
class ExpireUnansweredRfqs extends Command
{
    use HasProcurementHelpers;
    use ManagesCanvass;

    protected $signature = 'rfq:expire-unanswered';

    protected $description = 'Cancel RFQs sent to suppliers that have not replied within 7 calendar days';

    public function handle(): int
    {
        $overdue = RfqSupplier::with('rfq.creator')
            ->where('status', 'Sent')
            ->whereNotNull('reply_due_at')
            ->where('reply_due_at', '<', now())
            ->whereHas('rfq', fn ($query) => $query->where('status', 'Canvassing'))
            ->orderBy('id')
            ->get();

        foreach ($overdue as $rfqSupplier) {
            $this->cancelSupplierRfq($rfqSupplier, 'No reply within 7 calendar days; the RFQ sent to this supplier was cancelled.', auto: true);
            $this->line("Cancelled {$rfqSupplier->rfq->rfq_no} for {$rfqSupplier->supplier_name}");
        }

        $this->info("{$overdue->count()} unanswered RFQ(s) cancelled.");

        return self::SUCCESS;
    }
}
