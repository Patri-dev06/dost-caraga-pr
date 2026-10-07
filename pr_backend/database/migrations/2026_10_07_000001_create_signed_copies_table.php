<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Signatures are wet (on paper) for now: a document moves past its final signing step only
        // with the scan of its signed copy attached. One row per scan, on whichever document it signs.
        Schema::create('signed_copies', function (Blueprint $table): void {
            $table->id();
            $table->morphs('documentable');
            $table->string('step', 40); // e.g. pr_approved, rfq_signed, aoc_bac_passed, po_approved
            $table->string('signed_for')->nullable(); // whose signature the scan carries, e.g. "Regional Director"
            $table->boolean('on_behalf')->default(false); // uploaded by Supply for that signatory
            $table->string('path');
            $table->string('original_name');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size')->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signed_copies');
    }
};
