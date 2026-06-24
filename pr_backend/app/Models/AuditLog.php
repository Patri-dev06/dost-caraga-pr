<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    public $timestamps = false;

    protected $fillable = ['actor_id', 'actor_name', 'role', 'module', 'action', 'target', 'ip_address', 'created_at'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }
}
