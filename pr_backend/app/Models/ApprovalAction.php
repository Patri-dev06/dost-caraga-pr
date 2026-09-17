<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class ApprovalAction extends Model
{
    protected $fillable = ['actionable_id', 'actionable_type', 'user_id', 'role', 'action', 'remarks'];

    public function actionable(): MorphTo
    {
        return $this->morphTo();
    }
}
