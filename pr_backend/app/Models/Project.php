<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Project extends Model
{
    protected $fillable = ['office_id', 'fund_source_id', 'code', 'title', 'description', 'fiscal_year', 'status'];

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function fundSource(): BelongsTo
    {
        return $this->belongsTo(FundSource::class);
    }

    public function ppmpDocuments(): HasMany
    {
        return $this->hasMany(PpmpDocument::class);
    }
}
