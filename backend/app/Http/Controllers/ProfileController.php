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
        $user = $this->accounts->updateProfile($request->user(), $request->validated());

        return response()->json(['success' => true, 'message' => 'Profile updated.', 'data' => ['user' => new UserResource($user)]]);
    }

    public function password(UpdatePasswordRequest $request): JsonResponse
    {
        $this->accounts->updatePassword($request->user(), $request->password);

        return response()->json(['success' => true, 'message' => 'Password updated.', 'data' => (object) []]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $this->accounts->delete($request->user());

        return response()->json(status: 204);
    }
}
