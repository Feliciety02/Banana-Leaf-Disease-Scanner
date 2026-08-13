<?php

use App\Http\Controllers\PublicAccountController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/privacy', [PublicAccountController::class, 'privacy'])->name('privacy');
Route::get('/account-deletion', [PublicAccountController::class, 'deletionForm'])->name('account-deletion');
Route::post('/account-deletion', [PublicAccountController::class, 'destroy'])->middleware('throttle:auth');
Route::get('/reset-password', [PublicAccountController::class, 'resetForm'])->name('password.reset');
Route::post('/reset-password', [PublicAccountController::class, 'reset'])->middleware('throttle:auth');
Route::get('/email/verify/{id}/{hash}', [PublicAccountController::class, 'verifyEmail'])
    ->middleware(['signed', 'throttle:6,1'])
    ->name('verification.verify');
