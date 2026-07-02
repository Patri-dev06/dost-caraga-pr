<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class ApprovalStep extends Model
{
    protected $fillable = [
        'approvable_type',
        'approvable_id',
        'workflow_stage_id',
        'user_id',
        'approver_name',
        'approver_designation',
        'action',
        'remarks',
        'acted_at',
    ];

    protected function casts(): array
    {
        return [
            'acted_at' => 'datetime',
        ];
    }

    public function approvable(): MorphTo
    {
        return $this->morphTo();
    }

    public function workflowStage(): BelongsTo
    {
        return $this->belongsTo(ApprovalWorkflow::class, 'workflow_stage_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
