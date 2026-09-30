<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The official RFQ form varies per request: which documents the supplier submits with the
        // quotation (none, one such as the TOR, or a numbered list), and the FOB / VAT notes.
        Schema::table('rfqs', function (Blueprint $table): void {
            $table->json('required_documents')->nullable()->after('bac_action');
            $table->text('notes')->nullable()->after('required_documents');
        });
    }

    public function down(): void
    {
        Schema::table('rfqs', function (Blueprint $table): void {
            $table->dropColumn(['required_documents', 'notes']);
        });
    }
};
