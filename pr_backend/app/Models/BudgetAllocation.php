<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BudgetAllocation extends Model
{
    protected $fillable = ['project_id', 'account_code', 'account_name', 'allocated_amount', 'obligated_amount'];

    protected function casts(): array
    {
        return ['allocated_amount' => 'decimal:2', 'obligated_amount' => 'decimal:2'];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }
}
