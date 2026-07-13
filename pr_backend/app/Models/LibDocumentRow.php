<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LibDocumentRow extends Model
{
    protected $fillable = [
        'lib_document_id',
        'client_uid',
        'label',
        'note',
        'indent',
        'header',
        'approved',
        'reprogrammings',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'indent' => 'integer',
            'header' => 'boolean',
            'reprogrammings' => 'array',
            'sort_order' => 'integer',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(LibDocument::class, 'lib_document_id');
    }
}
