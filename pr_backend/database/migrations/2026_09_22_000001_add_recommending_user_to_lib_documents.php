<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lib_documents', function (Blueprint $table): void {
            // The account picked as "Recommending Approval" on the form; a submitted LIB is routed here.
            $table->foreignId('recommending_user_id')->nullable()->after('recommending_position')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('lib_documents', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('recommending_user_id');
        });
    }
};
