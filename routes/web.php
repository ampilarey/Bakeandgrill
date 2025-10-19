<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OpeningSoonController;

// Opening Soon Page - Main route
Route::get('/', [OpeningSoonController::class, 'index']);
