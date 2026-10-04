<?php

namespace App\Http\Controllers;

use App\Http\Requests\Profile\UpdatePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use App\Services\AccountService;
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
        $request->validate(['current_password' => ['required', 'current_password']]);
        $this->accounts->delete($request->user());

        return response()->json(status: 204);
    }
}
