<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Flowchart: a supplier that has not replied after 7 calendar days has its RFQ cancelled.
Schedule::command('rfq:expire-unanswered')->hourly()->withoutOverlapping();
