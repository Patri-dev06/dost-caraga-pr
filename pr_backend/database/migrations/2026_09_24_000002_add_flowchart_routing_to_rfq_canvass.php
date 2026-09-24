<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Brings the RFQ canvass onto the flowchart's green lane:
 *  - RFQ signing is now Supply Officer counter-sign first, then ONE signature from the BAC Chair or
 *    Vice-Chair (bac_signed_*). The old bac_chair_* / bac_vice_chair_* columns are kept as history.
 *  - suppliers get an email so the Supplier Portal link can reach them.
 *  - each canvassed supplier gets a hashed portal token, its uploaded signed quotation, and the TWG
 *    "check each equipment with supplier" result; each quoted item gets its complies/remarks.
 *  - the TWG specification evaluation notes move onto the RFQ (they now come before the AOC).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table): void {
            $table->string('email')->nullable()->after('contact_no');
        });

        Schema::table('rfqs', function (Blueprint $table): void {
            $table->foreignId('bac_signed_by')->nullable()->after('supply_officer_signed_at')->constrained('users')->nullOnDelete();
            $table->string('bac_signed_name')->nullable()->after('bac_signed_by');
            $table->string('bac_signed_role')->nullable()->after('bac_signed_name'); // BAC Chairman | BAC Vice-Chairman
            $table->timestamp('bac_signed_at')->nullable()->after('bac_signed_role');
            $table->text('twg_evaluation_notes')->nullable()->after('bac_signed_at');
        });

        Schema::table('rfq_suppliers', function (Blueprint $table): void {
            $table->string('supplier_email')->nullable()->after('supplier_tin');
            $table->string('portal_token_hash', 64)->nullable()->unique()->after('replied_at');
            $table->timestamp('portal_token_expires_at')->nullable()->after('portal_token_hash');
            $table->string('quotation_path')->nullable()->after('portal_token_expires_at');
            $table->string('quotation_original_name')->nullable()->after('quotation_path');
            $table->string('quote_submitted_via')->nullable()->after('quotation_original_name'); // Portal | Staff
            $table->string('twg_result')->nullable()->after('is_winner'); // Passed | Failed
            $table->timestamp('twg_evaluated_at')->nullable()->after('twg_result');
        });

        Schema::table('rfq_quote_items', function (Blueprint $table): void {
            $table->boolean('twg_complies')->nullable()->after('total_price');
            $table->text('twg_remarks')->nullable()->after('twg_complies');
        });

        // In-flight RFQs signed under the old order (BAC Chair -> Vice-Chair -> Supply Officer) keep
        // every signature already collected:
        //   Draft                               -> Draft (awaiting the Supply Officer, still editable)
        //   Pending BAC Vice-Chair Signature    -> Pending Supply Officer Countersign (BAC Chair already signed)
        //   Pending Supply Officer Countersign  -> Pending Supply Officer Countersign (BAC already signed)
        //   Ready to Send and later             -> unchanged
        // The BAC step only ever needs one of the two, so the Chairman's signature (or else the
        // Vice-Chairman's) becomes the RFQ's BAC signature.
        foreach (['bac_chair' => 'BAC Chairman', 'bac_vice_chair' => 'BAC Vice-Chairman'] as $prefix => $role) {
            DB::table('rfqs')
                ->whereNull('bac_signed_at')
                ->whereNotNull("{$prefix}_signed_at")
                ->update([
                    'bac_signed_by' => DB::raw("{$prefix}_signed_by"),
                    'bac_signed_name' => DB::raw("{$prefix}_signed_name"),
                    'bac_signed_role' => $role,
                    'bac_signed_at' => DB::raw("{$prefix}_signed_at"),
                ]);
        }
        DB::table('rfqs')
            ->where('status', 'Pending BAC Vice-Chair Signature')
            ->update(['status' => 'Pending Supply Officer Countersign', 'stage' => 'Pending Supply Officer Countersign']);

        // Equipment TWG notes used to be captured at AOC generation; carry them back onto the RFQ.
        foreach (DB::table('abstract_of_canvases')->whereNotNull('twg_evaluation_notes')->get(['rfq_id', 'twg_evaluation_notes']) as $aoc) {
            DB::table('rfqs')->where('id', $aoc->rfq_id)->update(['twg_evaluation_notes' => $aoc->twg_evaluation_notes]);
        }

        $descriptions = [
            'supply_officer_user_id' => 'Counter-signs an RFQ first, before the BAC Chairman/Vice-Chairman; notes the lowest bidder on a BAC-approved Abstract of Canvas; rates venues.',
            'bac_chair_user_id' => 'Signs an RFQ after the Supply Officer (either the Chairman or the Vice-Chairman completes that step), and reviews Abstracts of Canvas.',
            'bac_vice_chair_user_id' => 'Signs an RFQ after the Supply Officer when the Chairman does not (either one completes that step), and reviews Abstracts of Canvas.',
            'twg_lead_user_id' => 'Evaluates equipment specifications supplier by supplier, rates venues, and addresses BAC remarks on an Abstract of Canvas on behalf of the Technical Working Group.',
        ];
        foreach ($descriptions as $key => $description) {
            DB::table('system_preferences')->where('key', $key)->update(['description' => $description]);
        }
    }

    public function down(): void
    {
        DB::table('rfqs')
            ->where('status', 'Pending BAC Signature')
            ->update(['status' => 'Pending BAC Vice-Chair Signature', 'stage' => 'Pending BAC Vice-Chair Signature']);

        Schema::table('rfq_quote_items', function (Blueprint $table): void {
            $table->dropColumn(['twg_complies', 'twg_remarks']);
        });

        Schema::table('rfq_suppliers', function (Blueprint $table): void {
            $table->dropUnique(['portal_token_hash']);
            $table->dropColumn([
                'supplier_email', 'portal_token_hash', 'portal_token_expires_at', 'quotation_path',
                'quotation_original_name', 'quote_submitted_via', 'twg_result', 'twg_evaluated_at',
            ]);
        });

        Schema::table('rfqs', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('bac_signed_by');
            $table->dropColumn(['bac_signed_name', 'bac_signed_role', 'bac_signed_at', 'twg_evaluation_notes']);
        });

        Schema::table('suppliers', function (Blueprint $table): void {
            $table->dropColumn('email');
        });
    }
};
