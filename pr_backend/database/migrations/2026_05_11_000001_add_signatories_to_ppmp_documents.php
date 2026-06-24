<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->string('prepared_submitted_by_name')->nullable()->after('source_filename');
            $table->string('prepared_submitted_by_position')->nullable()->after('prepared_submitted_by_name');
            $table->date('prepared_submitted_by_date')->nullable()->after('prepared_submitted_by_position');
            $table->string('budget_officer_name')->nullable()->after('prepared_submitted_by_date');
            $table->string('budget_officer_position')->nullable()->after('budget_officer_name');
            $table->date('budget_certified_date')->nullable()->after('budget_officer_position');
        });
    }

    public function down(): void
    {
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->dropColumn([
                'prepared_submitted_by_name',
                'prepared_submitted_by_position',
                'prepared_submitted_by_date',
                'budget_officer_name',
                'budget_officer_position',
                'budget_certified_date',
            ]);
        });
    }
};
