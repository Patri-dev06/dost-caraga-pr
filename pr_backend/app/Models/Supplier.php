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

    /**
     * Carries corrected details (name, address, contact no., email, TIN) onto every RFQ where this
     * supplier has not replied yet. A supplier whose quotation is recorded keeps the details on
     * record then — the AOC and PO were built from them.
     */
    public function syncToOpenCanvasses(): int
    {
        return $this->rfqSuppliers()->whereIn('status', RfqSupplier::AWAITING_REPLY_STATUSES)->update([
            'supplier_name' => $this->name,
            'supplier_address' => $this->address,
            'supplier_contact_no' => $this->contact_no,
            'supplier_email' => $this->email,
            'supplier_tin' => $this->tin,
        ]);
    }

    public function rfqSuppliers(): HasMany
    {
        return $this->hasMany(RfqSupplier::class);
    }
}
