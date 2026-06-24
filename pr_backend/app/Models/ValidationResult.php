<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ValidationResult extends Model
{
    protected $fillable = ['purchase_request_id', 'purchase_request_item_id', 'label', 'status', 'message'];
}
