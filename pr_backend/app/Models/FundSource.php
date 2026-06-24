<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FundSource extends Model
{
    protected $fillable = ['name', 'fund_type', 'description', 'active'];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }
}
