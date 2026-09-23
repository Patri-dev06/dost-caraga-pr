<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rfq_suppliers', function (Blueprint $table): void {
            // When this supplier's quote actually came in — distinct from reply_due_at (the deadline)
            // and status='Replied' (no timestamp of its own). Feeds the "IN with Quotation" column
            // on the procurement monitoring sheet.
            $table->timestamp('replied_at')->nullable()->after('reply_due_at');
        });
    }

    public function down(): void
    {
        Schema::table('rfq_suppliers', function (Blueprint $table): void {
            $table->dropColumn('replied_at');
        });
    }
};
