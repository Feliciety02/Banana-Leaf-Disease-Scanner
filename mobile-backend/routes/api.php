<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\MobileDiagnosisController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\SyncController;
use App\Models\Disease;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['service' => 'bananacare-mobile-api', 'status' => 'ok']));
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/diseases', fn () => response()->json(['success' => true, 'message' => 'Disease information retrieved.', 'data' => Disease::query()->orderBy('id')->get()]));

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'password']);
    Route::delete('/profile', [ProfileController::class, 'destroy']);
    Route::get('/diagnoses', [MobileDiagnosisController::class, 'index']);
    Route::post('/diagnoses', [MobileDiagnosisController::class, 'store']);
    Route::post('/sync', SyncController::class);
    Route::post('/mobile/sync', SyncController::class);
});
