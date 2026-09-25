<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class PpmpDocument extends Model
{
    protected $fillable = [
        'client_uid',
        'project_id',
        'lib_document_id',
        'ppmp_no',
        'status',
        'revision_count',
        'fiscal_year',
        'end_user_unit',
        'document_type',
        'ppmp_class',
        'chargeable_to',
        'source_filename',
        'prepared_submitted_by_name',
        'prepared_submitted_by_position',
        'prepared_submitted_by_date',
        'budget_officer_name',
        'budget_officer_position',
        'budget_certified_date',
        'total_estimated_budget',
        'row_count',
        'form_rows',
        'imported_by',
        'owner_id',
        'owner_name',
        'imported_at',
        'budget_officer_id',
        'budget_officer_comment',
        'return_reason',
        'submitted_at',
        'reviewed_at',
        'approved_by_id',
        'approved_by_name',
        'approved_at',
        'approval_signature',
        'revision_of_id',
        'revision_reason',
        'superseded_at',
        'superseded_by_id',
    ];

    /** A PPMP in these states is not open to editing: it is with the Budget Officer, or certified. */
    public const LOCKED_STATUSES = ['Submitted to Budget Officer', 'Approved', 'Superseded'];

    /** A revision still being worked on — only one may be open per approved PPMP. */
    public const OPEN_REVISION_STATUSES = ['Draft', 'Submitted to Budget Officer', 'Returned'];

    protected function casts(): array
    {
        return [
            'fiscal_year' => 'integer',
            'revision_count' => 'integer',
            'total_estimated_budget' => 'decimal:2',
            'row_count' => 'integer',
            'form_rows' => 'array',
            'prepared_submitted_by_date' => 'date',
            'budget_certified_date' => 'date',
            'imported_at' => 'datetime',
            'submitted_at' => 'datetime',
            'reviewed_at' => 'datetime',
            'approved_at' => 'datetime',
            'superseded_at' => 'datetime',
        ];
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function libDocument(): BelongsTo
    {
        return $this->belongsTo(LibDocument::class);
    }

    public function importer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'imported_by');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function budgetOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'budget_officer_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PpmpItem::class);
    }

    /** The approved version this document revises (null for an original PPMP). */
    public function revisionOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'revision_of_id');
    }

    /** The revision that replaced this version once it was certified. */
    public function supersededBy(): BelongsTo
    {
        return $this->belongsTo(self::class, 'superseded_by_id');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(self::class, 'revision_of_id');
    }

    /** The revision of this PPMP still in progress (Draft, with the Budget Officer, or returned), if any. */
    public function openRevision(): HasOne
    {
        return $this->hasOne(self::class, 'revision_of_id')
            ->ofMany(['id' => 'max'], fn ($query) => $query->whereIn('status', self::OPEN_REVISION_STATUSES));
    }
}
