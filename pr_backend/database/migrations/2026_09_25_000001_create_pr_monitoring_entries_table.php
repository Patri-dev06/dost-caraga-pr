<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The Procurement Monitoring Sheet columns the system does not derive on its own (ORS/BURS,
        // delivery dates, IAR, issuance, payment, ...): kept up by the Supply team, one row per PR.
        Schema::create('pr_monitoring_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_request_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('values');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pr_monitoring_entries');
    }
};
