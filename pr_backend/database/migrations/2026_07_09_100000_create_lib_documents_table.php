<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lib_documents', function (Blueprint $table): void {
            $table->id();
            $table->string('client_uid')->unique();
            $table->string('fiscal_year', 10);
            $table->text('program_title')->nullable();
            $table->text('project_title')->nullable();
            $table->string('implementing_agency')->nullable();
            $table->string('total_duration')->nullable();
            $table->text('cooperating_agency')->nullable();
            $table->string('project_leader')->nullable();
            $table->string('monitoring_agency')->nullable();
            $table->unsignedInteger('revision')->default(0);
            $table->text('chargeable_note')->nullable();
            $table->string('prepared_by_name')->nullable();
            $table->string('prepared_by_position')->nullable();
            $table->string('recommending_name')->nullable();
            $table->string('recommending_position')->nullable();
            $table->string('certified_name')->nullable();
            $table->string('certified_position')->nullable();
            $table->string('approved_name')->nullable();
            $table->string('approved_position')->nullable();
            $table->string('status')->default('Draft');
            $table->json('history')->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('owner_name')->nullable();
            $table->timestamps();

            $table->index(['status', 'fiscal_year']);
            $table->index('owner_id');
        });

        Schema::create('lib_document_rows', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('lib_document_id')->constrained()->cascadeOnDelete();
            $table->string('client_uid');
            $table->text('label')->nullable();
            $table->text('note')->nullable();
            $table->unsignedTinyInteger('indent')->default(1);
            $table->boolean('header')->default(false);
            $table->string('approved')->nullable();
            $table->json('reprogrammings')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['lib_document_id', 'client_uid']);
            $table->index(['lib_document_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lib_document_rows');
        Schema::dropIfExists('lib_documents');
    }
};
