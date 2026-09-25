<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A PR's Supplementary Documents (SD), attached when it is submitted: a frozen copy of each
        // document as it stood then (a PPMP can later be revised), readable by the PR's approvers.
        Schema::create('purchase_request_supporting_documents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained()->cascadeOnDelete();
            $table->string('type', 32); // PPMP, LIB — see App\Services\PrSupportingDocuments::TYPES
            $table->unsignedBigInteger('source_id')->nullable(); // the live document it was copied from
            $table->string('source_uid')->nullable();
            $table->string('reference')->nullable();
            $table->string('title')->nullable();
            $table->decimal('total', 15, 2)->nullable();
            $table->json('snapshot');
            $table->foreignId('attached_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('attached_at');
            $table->timestamps();

            $table->unique(['purchase_request_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_request_supporting_documents');
    }
};
