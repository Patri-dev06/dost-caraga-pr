<?php

return [
    /*
    | E-signatures (uploaded signature images) are turned off for now: signing and approving work
    | without one, and no signature images appear on documents. They come back with PNPKI digital
    | signatures — set ESIGNATURE_ENABLED=true to switch the current image-based check back on.
    */
    'e_signature' => (bool) env('ESIGNATURE_ENABLED', false),

    /*
    | With wet signatures, a document passes its final signing step (PR approval, the RFQ's BAC
    | signature, the AOC's BAC pass, the PO's final approval, PPMP certification, LIB approval) only
    | with the scan of its signed copy attached. Leave this on; it exists so older automated tests
    | can run those steps without a scan.
    */
    'signed_copy_required' => (bool) env('SIGNED_COPY_REQUIRED', true),
];
