<?php

namespace App\Support;

/**
 * The Procurement Monitoring Sheet columns the Supply team fills in by hand — everything the system
 * does not already know from the PR, RFQ, AOC and PO records. Keys must match the frontend's
 * MONITORING_COLUMNS (pr_frontend/src/lib/monitoring-columns.ts); an unknown key is rejected.
 */
final class MonitoringFields
{
    /** key => date (Y-m-d) | datetime (Y-m-d\TH:i) | number | text */
    public const TYPES = [
        'sd_attached' => 'text',
        'delivery_term_days' => 'number',
        'ors_burs_no' => 'text',
        'ors_burs_at' => 'datetime',
        'ors_burs_by' => 'text',
        'received_by_supply_at' => 'date',
        'po_coa_received_at' => 'date',
        'delivery_due_at' => 'date',
        'po_receiving_remarks' => 'text',
        'days_before_due' => 'number',
        'delivered_partial_at' => 'date',
        'delivered_full_at' => 'date',
        'delivered_with_docs' => 'text',
        'soa_received_at' => 'date',
        'actual_days_delivered' => 'number',
        'liquidated_damages' => 'text',
        'delivery_remarks' => 'text',
        'iar_no' => 'text',
        'inspection_out_at' => 'date',
        'inspection_in_at' => 'date',
        'acceptance' => 'text',
        'iar_coa_received_at' => 'date',
        'inspection_remarks' => 'text',
        'issued_to_end_user_at' => 'date',
        'issuance_document' => 'text',
        'accountable_officer' => 'text',
        'issuance_remarks' => 'text',
        'payment_process' => 'text',
        'payment_prepared_at' => 'datetime',
        'payment_checking_at' => 'date',
        'out_for_payment_at' => 'date',
        'retention_fee' => 'text',
        'final_remarks' => 'text',
    ];

    /** @return array<string, array<int, string>> Validation rules for a `values` payload. */
    public static function rules(): array
    {
        $rules = ['values' => ['present', 'array']];
        foreach (self::TYPES as $key => $type) {
            $rules["values.{$key}"] = match ($type) {
                'date' => ['nullable', 'date_format:Y-m-d'],
                'datetime' => ['nullable', 'date_format:Y-m-d\TH:i'],
                'number' => ['nullable', 'numeric'],
                default => ['nullable', 'string', 'max:2000'],
            };
        }

        return $rules;
    }
}
