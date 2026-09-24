<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Brings the PR onto the flowchart's Module 1 routing:
 *  - ppmp_document_id: the planning PPMP a PR is "Charged to". Its class (Regular vs Project)
 *    answers the flowchart's "Regular fund?" and, for a Project PPMP, identifies the project.
 *  - cancelled_*: the flowchart's two "Cancel PR" boxes (BAC not satisfied, supplier waived delivery).
 *  - re_pr_of_id: the new draft a requester files after being told to "Re-PR".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchase_requests', function (Blueprint $table): void {
            $table->foreignId('ppmp_document_id')->nullable()->after('project_id')->constrained('ppmp_documents')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable()->after('submitted_at');
            $table->text('cancel_reason')->nullable()->after('cancelled_at');
            $table->string('cancelled_from')->nullable()->after('cancel_reason'); // AOC | PO
            $table->foreignId('re_pr_of_id')->nullable()->after('cancelled_from')->constrained('purchase_requests')->nullOnDelete();
        });

        // PRs filed before this link existed carry the PPMP only in their fund source label,
        // "PPMP {ppmp_no} — {LIB project title or end-user unit}". Link the ones that match exactly one PPMP.
        $documents = DB::table('ppmp_documents')
            ->leftJoin('lib_documents', 'lib_documents.id', '=', 'ppmp_documents.lib_document_id')
            ->select('ppmp_documents.id', 'ppmp_documents.ppmp_no', 'ppmp_documents.end_user_unit', 'lib_documents.project_title')
            ->get();

        $byLabel = [];
        foreach ($documents as $document) {
            $detail = trim((string) ($document->project_title ?: $document->end_user_unit));
            $label = 'PPMP '.$document->ppmp_no.($detail !== '' ? ' — '.$detail : '');
            $byLabel[$label][] = $document->id;
        }

        $fundSources = DB::table('fund_sources')->where('name', 'like', 'PPMP %')->pluck('name', 'id');
        foreach ($fundSources as $fundSourceId => $name) {
            $matches = $byLabel[$name] ?? [];
            if (count($matches) === 1) {
                DB::table('purchase_requests')
                    ->where('fund_source_id', $fundSourceId)
                    ->whereNull('ppmp_document_id')
                    ->update(['ppmp_document_id' => $matches[0]]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('purchase_requests', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('re_pr_of_id');
            $table->dropColumn(['cancelled_at', 'cancel_reason', 'cancelled_from']);
            $table->dropConstrainedForeignId('ppmp_document_id');
        });
    }
};
