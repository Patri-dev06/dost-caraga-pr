<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lib_entries', function (Blueprint $table): void {
            $table->string('program_title')->nullable()->after('pap_code');
            $table->string('implementing_agency')->nullable()->after('program_title');
            $table->string('total_duration')->nullable()->after('implementing_agency');
            $table->text('cooperating_agency')->nullable()->after('total_duration');
            $table->string('project_leader')->nullable()->after('cooperating_agency');
            $table->string('monitoring_agency')->nullable()->after('project_leader');
        });

        Schema::create('lib_line_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('lib_entry_id')->constrained('lib_entries')->cascadeOnDelete();
            $table->string('main_category', 100);
            $table->string('sub_category', 150);
            $table->string('specific_item', 150)->nullable();
            $table->string('custom_item_name', 255)->nullable();
            $table->decimal('approved_lib_amount', 14, 2)->default(0);
            $table->decimal('jan', 14, 2)->default(0);
            $table->decimal('feb', 14, 2)->default(0);
            $table->decimal('mar', 14, 2)->default(0);
            $table->decimal('apr', 14, 2)->default(0);
            $table->decimal('may', 14, 2)->default(0);
            $table->decimal('jun', 14, 2)->default(0);
            $table->decimal('jul', 14, 2)->default(0);
            $table->decimal('aug', 14, 2)->default(0);
            $table->decimal('sep', 14, 2)->default(0);
            $table->decimal('oct', 14, 2)->default(0);
            $table->decimal('nov', 14, 2)->default(0);
            $table->decimal('dec_amount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('lib_entry_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lib_line_items');

        Schema::table('lib_entries', function (Blueprint $table): void {
            $table->dropColumn([
                'program_title',
                'implementing_agency',
                'total_duration',
                'cooperating_agency',
                'project_leader',
                'monitoring_agency',
            ]);
        });
    }
};
