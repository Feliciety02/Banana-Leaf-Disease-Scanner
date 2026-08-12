<?php

use App\Http\Controllers\Admin\DiagnosisController as AdminDiagnosisController;
use App\Http\Controllers\Admin\DiseaseController as AdminDiseaseController;
use App\Http\Controllers\Admin\ResearchSourceController;
use App\Http\Controllers\Admin\SystemController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DiagnosisController;
use App\Http\Controllers\DiseaseController;
use App\Http\Controllers\Expert\DashboardController as ExpertDashboardController;
use App\Http\Controllers\Expert\DatasetCandidateController;
use App\Http\Controllers\Expert\DiagnosisReviewController;
use App\Http\Controllers\Expert\DiseaseVerificationController;
use App\Http\Controllers\Expert\ResearchSourceController as ExpertResearchSourceController;
use App\Http\Controllers\InferenceController;
use App\Http\Controllers\MobileSyncController;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['service' => 'dahonmd-web-api', 'status' => 'ok']));
Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);
Route::apiResource('diseases', DiseaseController::class)->only(['index', 'show']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'password']);
    Route::delete('/profile', [ProfileController::class, 'destroy']);
    Route::apiResource('diagnoses', DiagnosisController::class)->only(['index', 'store', 'show', 'destroy']);
    Route::post('/diagnoses/{diagnosis}/review-request', [DiagnosisController::class, 'requestReview']);
    Route::post('/inference', InferenceController::class);
    Route::post('/mobile/sync', MobileSyncController::class);

    Route::prefix('admin')->middleware('admin')->group(function () {
        Route::get('/', DashboardController::class);
        Route::get('/dashboard', DashboardController::class);
        Route::get('/analytics', DashboardController::class);
        Route::get('/system', [SystemController::class, 'show']);
        Route::get('/farmers', [AdminUserController::class, 'indexFarmers']);
        Route::post('/farmers', [AdminUserController::class, 'storeFarmer']);
        Route::get('/farmers/{user}', [AdminUserController::class, 'showFarmer']);
        Route::match(['put', 'patch'], '/farmers/{user}', [AdminUserController::class, 'updateFarmer']);
        Route::delete('/farmers/{user}', [AdminUserController::class, 'destroyFarmer']);
        Route::get('/experts', [AdminUserController::class, 'indexExperts']);
        Route::post('/experts', [AdminUserController::class, 'storeExpert']);
        Route::match(['put', 'patch'], '/experts/{user}', [AdminUserController::class, 'updateExpert']);
        Route::delete('/experts/{user}', [AdminUserController::class, 'destroyExpert']);
        Route::apiResource('users', AdminUserController::class)->except(['edit', 'create']);
        Route::apiResource('diseases', AdminDiseaseController::class)->only(['index', 'show', 'store', 'update', 'destroy']);
        Route::put('/diseases/{disease}/status', [AdminDiseaseController::class, 'setStatus']);
        Route::post('/diseases/{disease}/symptoms', [AdminDiseaseController::class, 'storeSymptom']);
        Route::delete('/diseases/{disease}/symptoms/{symptom}', [AdminDiseaseController::class, 'destroySymptom']);
        Route::post('/diseases/{disease}/management', [AdminDiseaseController::class, 'storeManagement']);
        Route::delete('/diseases/{disease}/management/{management}', [AdminDiseaseController::class, 'destroyManagement']);
        Route::post('/diseases/{disease}/management/{management}/regulatory-checks', [AdminDiseaseController::class, 'storeRegulatoryCheck']);
        Route::post('/diseases/{disease}/evidence', [AdminDiseaseController::class, 'storeEvidence']);
        Route::delete('/diseases/{disease}/evidence/{evidence}', [AdminDiseaseController::class, 'destroyEvidence']);
        Route::apiResource('research-sources', ResearchSourceController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::apiResource('diagnoses', AdminDiagnosisController::class)->only(['index', 'show', 'destroy']);
    });

    Route::prefix('expert')->middleware('agricultural_expert')->group(function () {
        Route::get('/dashboard', ExpertDashboardController::class);
        Route::get('/diagnosis-reviews', [DiagnosisReviewController::class, 'index']);
        Route::get('/diagnosis-reviews/{diagnosis}', [DiagnosisReviewController::class, 'show']);
        Route::put('/diagnosis-reviews/{diagnosis}', [DiagnosisReviewController::class, 'update']);
        Route::get('/diseases', [DiseaseVerificationController::class, 'index']);
        Route::get('/diseases/{disease}', [DiseaseVerificationController::class, 'show']);
        Route::post('/diseases/{disease}/verification', [DiseaseVerificationController::class, 'store']);
        Route::get('/research-sources', [ExpertResearchSourceController::class, 'index']);
        Route::get('/dataset-candidates', [DatasetCandidateController::class, 'index']);
        Route::post('/dataset-candidates/from-diagnosis/{diagnosis}', [DatasetCandidateController::class, 'store']);
        Route::put('/dataset-candidates/{candidate}', [DatasetCandidateController::class, 'update']);
    });
});
