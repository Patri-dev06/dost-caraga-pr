<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A user's registered PNPKI certificate. The .p12 is stored encrypted (PNPKI_STORAGE_KEY) and
        // still needs its own password, which is never stored. Replaced or removed certificates stay as
        // a record of who signed with what, with their key material erased.
        Schema::create('signing_certificates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('encrypted_p12')->nullable();
            $table->string('subject_cn');
            $table->text('subject_dn');
            $table->string('email')->nullable();
            $table->string('serial');
            $table->string('issuer_cn')->nullable();
            $table->text('issuer_dn');
            $table->string('fingerprint_sha256', 64)->index();
            $table->timestamp('valid_from');
            $table->timestamp('valid_to');
            $table->text('certificate_pem');
            $table->text('chain_pem')->nullable();
            $table->boolean('issuer_trusted')->default(false);
            $table->timestamp('removed_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'removed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('signing_certificates');
    }
};
