<?php

use App\Models\PurchaseRequest;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Generalizes approval_actions beyond Purchase Requests so RFQs and Purchase Orders
 * can share the same recommend/approve/reject trail via a polymorphic relation.
 * purchase_request_id is kept (now nullable) for existing rows and is never written
 * to again; new rows use actionable_id/actionable_type instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_actions', function (Blueprint $table): void {
            $table->unsignedBigInteger('actionable_id')->nullable()->after('id');
            $table->string('actionable_type')->nullable()->after('actionable_id');
            $table->index(['actionable_type', 'actionable_id']);
        });

        DB::statement('ALTER TABLE approval_actions ALTER COLUMN purchase_request_id DROP NOT NULL');

        DB::table('approval_actions')->update([
            'actionable_id' => DB::raw('purchase_request_id'),
            'actionable_type' => PurchaseRequest::class,
        ]);
    }

    public function down(): void
    {
        Schema::table('approval_actions', function (Blueprint $table): void {
            $table->dropIndex(['actionable_type', 'actionable_id']);
            $table->dropColumn(['actionable_id', 'actionable_type']);
        });

        DB::statement('ALTER TABLE approval_actions ALTER COLUMN purchase_request_id SET NOT NULL');
    }
};
