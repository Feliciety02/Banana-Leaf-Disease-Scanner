<?php

namespace App\Http\Controllers;

use App\Http\Requests\Profile\UpdatePasswordRequest;
use App\Http\Requests\Profile\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Profile retrieved.', 'data' => ['user' => new UserResource($request->user())]]);
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();
        $emailChanged = isset($validated['email']) && $validated['email'] !== $user->email;
        $user->update($validated);
        if ($emailChanged) {
            $user->forceFill(['email_verified_at' => null])->save();
            $user->sendEmailVerificationNotification();
        }

        return response()->json(['success' => true, 'message' => 'Profile updated.', 'data' => ['user' => new UserResource($user->fresh())]]);
    }

    public function password(UpdatePasswordRequest $request): JsonResponse
    {
        $request->user()->update(['password' => Hash::make($request->password)]);
        $request->user()->tokens()->whereKeyNot($request->user()->currentAccessToken()?->getKey())->delete();

        return response()->json(['success' => true, 'message' => 'Password updated.', 'data' => (object) []]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->tokens()->delete();
        $user->delete();

        return response()->json(status: 204);
    }
}
