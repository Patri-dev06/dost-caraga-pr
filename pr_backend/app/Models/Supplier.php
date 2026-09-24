<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Supplier extends Model
{
    protected $fillable = [
        'name',
        'address',
        'contact_no',
        'email',
        'tin',
        'category',
        'active',
    ];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function rfqSuppliers(): HasMany
    {
        return $this->hasMany(RfqSupplier::class);
    }
}
