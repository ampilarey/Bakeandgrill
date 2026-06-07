<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Auth\CustomerAuthController;
use App\Http\Controllers\Api\Auth\DeviceController;
use App\Http\Controllers\Api\Auth\StaffAuthController;
use App\Http\Controllers\Api\BmlWebhookController;
use App\Http\Controllers\Api\CashMovementController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\KdsController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PrintJobController;
use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\ReceiptController;
use App\Http\Controllers\Api\RefundController;
use App\Http\Controllers\Api\ReportsController;
use App\Http\Controllers\Api\ReservationController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\SmsPromotionController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\TableController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/

