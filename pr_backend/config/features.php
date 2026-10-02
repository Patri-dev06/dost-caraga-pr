<?php

return [
    /*
    | E-signatures (uploaded signature images) are turned off for now: signing and approving work
    | without one, and no signature images appear on documents. They come back with PNPKI digital
    | signatures — set ESIGNATURE_ENABLED=true to switch the current image-based check back on.
    */
    'e_signature' => (bool) env('ESIGNATURE_ENABLED', false),
];
