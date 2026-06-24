<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offices', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('code')->nullable()->unique();
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('roles', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->text('description')->nullable();
            $table->json('permissions')->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('office_id')->nullable()->after('id')->constrained()->nullOnDelete();
            $table->string('status')->default('Active')->after('password');
            $table->timestamp('last_login_at')->nullable()->after('remember_token');
        });

        Schema::create('role_user', function (Blueprint $table): void {
            $table->foreignId('role_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['role_id', 'user_id']);
        });

        Schema::create('api_tokens', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('token_hash', 64)->unique();
            $table->timestamp('expires_at')->index();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        Schema::create('fund_sources', function (Blueprint $table): void {
            $table->id();
            $table->string('name')->unique();
            $table->string('fund_type');
            $table->text('description')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('projects', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('office_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('fund_source_id')->nullable()->constrained()->nullOnDelete();
            $table->string('code')->unique();
            $table->string('title');
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('fiscal_year');
            $table->string('status')->default('Active');
            $table->timestamps();
        });

        Schema::create('procurement_items', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('category')->nullable();
            $table->string('uom', 30);
            $table->boolean('is_cse')->default(false);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('ppmp_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->foreignId('procurement_item_id')->constrained()->restrictOnDelete();
            $table->string('code')->nullable();
            $table->decimal('quantity', 12, 2);
            $table->decimal('estimated_unit_cost', 14, 2);
            $table->string('schedule')->nullable();
            $table->timestamps();
        });

        Schema::create('app_cse_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('procurement_item_id')->constrained()->restrictOnDelete();
            $table->string('code')->nullable();
            $table->decimal('quantity', 12, 2);
            $table->decimal('unit_price', 14, 2);
            $table->timestamps();
        });

        Schema::create('app_non_cse_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('procurement_item_id')->constrained()->restrictOnDelete();
            $table->string('code')->nullable();
            $table->decimal('quantity', 12, 2);
            $table->decimal('estimated_cost', 14, 2);
            $table->timestamps();
        });

        Schema::create('budget_allocations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('account_code');
            $table->string('account_name');
            $table->decimal('allocated_amount', 14, 2);
            $table->decimal('obligated_amount', 14, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('purchase_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('pr_no')->unique();
            $table->foreignId('office_id')->constrained()->restrictOnDelete();
            $table->foreignId('fund_source_id')->constrained()->restrictOnDelete();
            $table->foreignId('project_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('mode_of_procurement');
            $table->text('purpose');
            $table->string('status')->default('Draft');
            $table->string('stage')->default('Draft');
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
        });

        Schema::create('purchase_request_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('procurement_item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('uom', 30);
            $table->decimal('quantity', 12, 2);
            $table->decimal('unit_cost', 14, 2);
            $table->timestamps();
        });

        Schema::create('validation_results', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('purchase_request_item_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('label');
            $table->string('status');
            $table->text('message');
            $table->timestamps();
        });

        Schema::create('approval_actions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('role')->nullable();
            $table->string('action');
            $table->text('remarks')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('actor_name')->nullable();
            $table->string('role')->nullable();
            $table->string('module');
            $table->string('action');
            $table->string('target')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('approval_actions');
        Schema::dropIfExists('validation_results');
        Schema::dropIfExists('purchase_request_items');
        Schema::dropIfExists('purchase_requests');
        Schema::dropIfExists('budget_allocations');
        Schema::dropIfExists('app_non_cse_items');
        Schema::dropIfExists('app_cse_items');
        Schema::dropIfExists('ppmp_items');
        Schema::dropIfExists('procurement_items');
        Schema::dropIfExists('projects');
        Schema::dropIfExists('fund_sources');
        Schema::dropIfExists('api_tokens');
        Schema::dropIfExists('role_user');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('office_id');
            $table->dropColumn(['status', 'last_login_at']);
        });

        Schema::dropIfExists('roles');
        Schema::dropIfExists('offices');
    }
};
