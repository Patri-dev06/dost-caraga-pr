<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ApprovalWorkflow extends Model
{
    protected $fillable = [
        'document_type',
        'stage_order',
        'stage_name',
        'required_role',
        'description',
        'is_final',
    ];

    protected function casts(): array
    {
        return [
            'stage_order' => 'integer',
            'is_final' => 'boolean',
        ];
    }

    public function steps(): HasMany
    {
        return $this->hasMany(ApprovalStep::class, 'workflow_stage_id');
    }
}
