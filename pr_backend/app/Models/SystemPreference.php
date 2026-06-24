<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SystemPreference extends Model
{
    protected $fillable = ['key', 'value', 'category', 'label', 'description', 'type'];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }
}
