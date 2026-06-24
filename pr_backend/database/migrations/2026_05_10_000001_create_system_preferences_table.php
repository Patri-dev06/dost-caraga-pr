<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('system_preferences', function (Blueprint $table): void {
            $table->id();
            $table->string('key')->unique();
            $table->json('value')->nullable();
            $table->string('category')->default('General');
            $table->string('label');
            $table->text('description')->nullable();
            $table->string('type')->default('text');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('system_preferences');
    }
};
