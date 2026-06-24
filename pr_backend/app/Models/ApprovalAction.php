<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApprovalAction extends Model
{
    protected $fillable = ['purchase_request_id', 'user_id', 'role', 'action', 'remarks'];
}
