<?php

namespace App\Http\Controllers;

use App\Http\Requests\Profile\UpdatePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Services\AccountService;
use App\Services\DiagnosisService;
use App\Models\Diagnosis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    public function __construct(private readonly AccountService $accounts) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Profile retrieved.', 'data' => ['user' => new UserResource($request->user())]]);
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $this->accounts->updateProfile($request->user(), $request->safe()->except('current_password'));

        return response()->json(['success' => true, 'message' => 'Profile updated.', 'data' => ['user' => new UserResource($user)]]);
    }

    public function researchConsent(Request $request, DiagnosisService $diagnoses): JsonResponse
    {
        abort_unless($request->user()->isFarmer(), 403);
        $data = $request->validate(['research_photo_consent' => ['required', 'boolean']]);
        $user = $request->user();
        if ($data['research_photo_consent']) {
            $user->forceFill([
                'research_photo_consent_at' => now(),
                'research_photo_consent_version' => config('banana.research_consent_version'),
            ])->save();
        } else {
            $user->forceFill([
                'research_photo_consent_at' => null,
                'research_photo_consent_version' => null,
            ])->save();
            Diagnosis::withTrashed()->where('user_id', $user->id)->whereNotNull('research_consented_at')
                ->whereNull('research_consent_withdrawn_at')->get()
                ->each(fn (Diagnosis $diagnosis) => $diagnoses->withdrawResearchConsent($diagnosis));
        }
        return response()->json(['success' => true, 'message' => 'Research preference updated.', 'data' => ['user' => new UserResource($user->fresh())]]);
    }

    public function avatar(Request $request): JsonResponse
    {
        $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120', 'dimensions:max_width=5000,max_height=5000'],
        ]);
        $user = $this->accounts->updateAvatar($request->user(), $request->file('avatar'));

        return response()->json(['success' => true, 'message' => 'Profile photo updated.', 'data' => ['user' => new UserResource($user)]]);
    }

    public function removeAvatar(Request $request): JsonResponse
    {
        $user = $this->accounts->removeAvatar($request->user());

        return response()->json(['success' => true, 'message' => 'Profile photo removed.', 'data' => ['user' => new UserResource($user)]]);
    }

    public function password(UpdatePasswordRequest $request): JsonResponse
    {
        $this->accounts->updatePassword(
            $request->user(),
            $request->password,
            $request->hasSession() ? $request->session()->getId() : null,
        );

        return response()->json(['success' => true, 'message' => 'Password updated.', 'data' => (object) []]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'remove_research_copies' => ['sometimes', 'boolean'],
        ]);
        $this->accounts->delete($request->user(), (bool) ($data['remove_research_copies'] ?? false));

        return response()->json(status: 204);
    }
}
