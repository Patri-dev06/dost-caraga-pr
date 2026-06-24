<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'name' => 'DOST Caraga Procurement System API',
        'status' => 'ok',
    ]);
});
