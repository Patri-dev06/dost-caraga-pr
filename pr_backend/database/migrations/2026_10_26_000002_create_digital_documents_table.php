<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A document's PDF for PNPKI digital signing (e.g. a PR). Each signature is an incremental
        // update of the same PDF, so it is kept version by version; `path` is the latest version.
        Schema::create('digital_documents', function (Blueprint $table): void {
            $table->id();
            $table->morphs('documentable');
            $table->string('kind', 40); // purchase_request, ...
            $table->string('path');
            $table->unsignedInteger('version')->default(0);
            $table->string('sha256', 64);
            $table->json('fields'); // [{name, label, page, box}] — where each signatory signs
            $table->timestamps();
            $table->unique(['documentable_type', 'documentable_id', 'kind']);
        });

        Schema::create('digital_signatures', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('digital_document_id')->constrained()->cascadeOnDelete();
            $table->string('field', 40);
            $table->string('label');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('signing_certificate_id')->nullable()->constrained()->nullOnDelete();
            $table->string('signer_name');
            $table->string('certificate_cn');
            $table->string('certificate_serial');
            $table->string('issuer_cn')->nullable();
            $table->unsignedInteger('version');
            $table->string('sha256', 64); // of the PDF this signature produced
            $table->timestamp('signed_at');
            $table->timestamps();
            $table->unique(['digital_document_id', 'field']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('digital_signatures');
        Schema::dropIfExists('digital_documents');
    }
};
