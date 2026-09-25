<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The PR's own signatories: the recommending officer it is routed to (only they are notified
        // and may recommend it), and the designations printed under each signature.
        Schema::table('purchase_requests', function (Blueprint $table): void {
            $table->foreignId('recommending_officer_id')->nullable()->after('requested_by')->constrained('users')->nullOnDelete();
            $table->string('recommending_designation')->nullable()->after('recommending_officer_id');
            $table->string('approving_designation')->nullable()->after('recommending_designation');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_requests', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('recommending_officer_id');
            $table->dropColumn(['recommending_designation', 'approving_designation']);
        });
    }
};
