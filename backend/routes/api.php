<?php

use App\Http\Controllers\Admin\DiagnosisController as AdminDiagnosisController;
use App\Http\Controllers\Admin\DiseaseController as AdminDiseaseController;
use App\Http\Controllers\Admin\ModelComparisonController;
use App\Http\Controllers\Admin\ResearchSourceController;
use App\Http\Controllers\Admin\ArticleController as AdminArticleController;
use App\Http\Controllers\ArticleController;
use App\Http\Controllers\ArticleImageController;
use App\Http\Controllers\Admin\SystemController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DiagnosisController;
use App\Http\Controllers\DiagnosisMediaController;
use App\Http\Controllers\DiseaseController;
use App\Http\Controllers\Expert\DashboardController as ExpertDashboardController;
use App\Http\Controllers\Expert\DatasetCandidateController;
use App\Http\Controllers\Expert\DiagnosisReviewController;
use App\Http\Controllers\Expert\DiseaseVerificationController;
use App\Http\Controllers\Expert\ResearchSourceController as ExpertResearchSourceController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\InferenceController;
use App\Http\Controllers\MobileSyncController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\UserAvatarController;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class)->middleware('throttle:public-api');
Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/auth/reset-password', [AuthController::class, 'resetPassword']);
});
Route::apiResource('diseases', DiseaseController::class)->only(['index', 'show'])->middleware('throttle:public-api');
// The article library is public so the app can download it for offline reading before sign-in.
Route::get('/articles', [ArticleController::class, 'index'])->middleware('throttle:public-api');
Route::get('/article-images/{file}', ArticleImageController::class)->middleware('throttle:media')->name('article-images.show');
// Screening is available before sign-in, as it is on the mobile app; saving a
// result still requires a farmer account.
Route::post('/inference', InferenceController::class)->middleware('throttle:inference');

// Scan photos accept a signed-in request or a signed URL from DiagnosisResource,
// because browsers cannot attach a token to an <img>; the controller checks access.
Route::get('/diagnosis-media/{diagnosis}/{kind}', DiagnosisMediaController::class)
    ->where('kind', 'image|gradcam')
    ->middleware('throttle:media')
    ->name('diagnosis-media.show');

Route::middleware(['auth:sanctum', 'throttle:authenticated-api'])->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/verification-notification', [AuthController::class, 'resendVerification'])->middleware('throttle:6,1');
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'password']);
    Route::post('/profile/avatar', [ProfileController::class, 'avatar'])->middleware('throttle:6,1');
    Route::delete('/profile/avatar', [ProfileController::class, 'removeAvatar']);
    Route::get('/user-avatars/{user}', UserAvatarController::class)->name('user-avatars.show');
    Route::delete('/profile', [ProfileController::class, 'destroy']);
    Route::post('/research/model-comparison', ModelComparisonController::class);
    Route::post('/chat', ChatController::class)->middleware('throttle:ai-chat');

    Route::middleware('role:'.User::ROLE_FARMER)->group(function () {
        Route::apiResource('diagnoses', DiagnosisController::class)->only(['index', 'store', 'show', 'destroy']);
        // Asking an expert must not depend on email access; a per-farmer limit stops flooding instead.
        Route::post('/diagnoses/{diagnosis}/review-request', [DiagnosisController::class, 'requestReview'])->middleware('throttle:review-requests');
        Route::post('/diagnoses/{diagnosis}/review-seen', [DiagnosisController::class, 'markReviewSeen']);
        Route::put('/diagnoses/{diagnosis}/location', [DiagnosisController::class, 'setLocation']);
        Route::delete('/diagnoses/{diagnosis}/location', [DiagnosisController::class, 'removeLocation']);
        Route::post('/diagnoses/{diagnosis}/follow-up', [DiagnosisController::class, 'followUp'])->middleware('throttle:review-requests');
        Route::post('/diagnoses/{diagnosis}/research-consent', [DiagnosisController::class, 'grantResearchConsent'])->middleware('verified.required');
        Route::delete('/diagnoses/{diagnosis}/research-consent', [DiagnosisController::class, 'withdrawResearchConsent']);
        Route::get('/research-images', [\App\Http\Controllers\FarmerResearchImageController::class, 'index']);
        Route::delete('/research-images/{researchImage}', [\App\Http\Controllers\FarmerResearchImageController::class, 'destroy']);
        Route::post('/mobile/sync', MobileSyncController::class)->middleware('throttle:sync');
        Route::get('/mobile/sync', [MobileSyncController::class, 'pull'])->middleware('throttle:sync');
        Route::post('/mobile/sync/{syncUuid}/image', [MobileSyncController::class, 'image'])->middleware('throttle:sync');
        Route::post('/sync', MobileSyncController::class)->middleware('throttle:sync');
        Route::get('/sync', [MobileSyncController::class, 'pull'])->middleware('throttle:sync');
        Route::post('/sync/{syncUuid}/image', [MobileSyncController::class, 'image'])->middleware('throttle:sync');
        Route::prefix('v1')->group(function () {
            Route::post('/sync', MobileSyncController::class)->middleware('throttle:sync');
            Route::get('/sync', [MobileSyncController::class, 'pull'])->middleware('throttle:sync');
            Route::post('/sync/{syncUuid}/image', [MobileSyncController::class, 'image'])->middleware('throttle:sync');
        });
    });

    Route::prefix('admin')->middleware(['role:'.User::ROLE_ADMIN, 'verified.required'])->group(function () {
        Route::get('/', DashboardController::class);
        Route::get('/dashboard', DashboardController::class);
        Route::get('/analytics', DashboardController::class);
        Route::get('/system', [SystemController::class, 'show']);
        Route::post('/model-comparison', ModelComparisonController::class);
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
        Route::apiResource('articles', AdminArticleController::class)->only(['index', 'store', 'update', 'destroy']);
        Route::post('/article-images', [AdminArticleController::class, 'uploadImage'])->middleware('throttle:20,1');
        Route::apiResource('diagnoses', AdminDiagnosisController::class)->only(['index', 'show', 'destroy']);
        // Administrators can decide on agriculturist nominations, so a single
        // agriculturist never has to approve their own nomination.
        Route::get('/dataset-candidates', [DatasetCandidateController::class, 'index']);
        Route::put('/dataset-candidates/{candidate}', [DatasetCandidateController::class, 'update']);
        Route::get('/research-images', [\App\Http\Controllers\Admin\ResearchImageController::class, 'index']);
        Route::get('/research-images/{researchImage}/photo', [\App\Http\Controllers\Admin\ResearchImageController::class, 'photo']);
        Route::delete('/research-images/{researchImage}', [\App\Http\Controllers\Admin\ResearchImageController::class, 'destroy']);
    });

    Route::prefix('expert')->middleware(['role:'.User::ROLE_AGRICULTURAL_EXPERT, 'verified.required'])->group(function () {
        Route::get('/dashboard', ExpertDashboardController::class);
        Route::get('/diagnosis-reviews', [DiagnosisReviewController::class, 'index']);
        Route::get('/diagnosis-reviews/{diagnosis}', [DiagnosisReviewController::class, 'show']);
        Route::put('/diagnosis-reviews/{diagnosis}', [DiagnosisReviewController::class, 'update']);
        Route::post('/diagnosis-reviews/{diagnosis}/claim', [DiagnosisReviewController::class, 'claim']);
        Route::delete('/diagnosis-reviews/{diagnosis}/claim', [DiagnosisReviewController::class, 'release']);
        Route::get('/diseases', [DiseaseVerificationController::class, 'index']);
        Route::get('/diseases/{disease}', [DiseaseVerificationController::class, 'show']);
        Route::post('/diseases/{disease}/verification', [DiseaseVerificationController::class, 'store']);
        Route::get('/research-sources', [ExpertResearchSourceController::class, 'index']);
        Route::get('/dataset-candidates', [DatasetCandidateController::class, 'index']);
        Route::post('/dataset-candidates/from-diagnosis/{diagnosis}', [DatasetCandidateController::class, 'store']);
        Route::put('/dataset-candidates/{candidate}', [DatasetCandidateController::class, 'update']);
    });
});
