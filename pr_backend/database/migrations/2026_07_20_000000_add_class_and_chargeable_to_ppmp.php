<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            // Regular = GAA-funded office operations; Project = backed by a LIB.
            $table->string('ppmp_class')->default('Project')->after('document_type');
            // What the PPMP is chargeable to (e.g. GAA line, project fund, account).
            $table->string('chargeable_to')->nullable()->after('ppmp_class');
        });
    }

    public function down(): void
    {
        Schema::table('ppmp_documents', function (Blueprint $table): void {
            $table->dropColumn(['ppmp_class', 'chargeable_to']);
        });
    }
};
