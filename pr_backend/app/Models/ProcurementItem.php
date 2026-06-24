<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProcurementItem extends Model
{
    protected $fillable = ['name', 'description', 'category', 'uom', 'is_cse', 'active'];

    protected function casts(): array
    {
        return ['is_cse' => 'boolean', 'active' => 'boolean'];
    }
}
