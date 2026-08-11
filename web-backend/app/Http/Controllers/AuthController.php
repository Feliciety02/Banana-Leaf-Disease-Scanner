<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::query()->create([...$request->validated(), 'password' => Hash::make($request->password), 'role' => 'user']);
        $token = $user->createToken($request->string('device_name', 'web')->toString())->plainTextToken;

        return response()->json(['success' => true, 'message' => 'Registration successful.', 'data' => ['user' => new UserResource($user), 'token' => $token]], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $user = User::query()->where('email', $request->string('email')->lower())->first();
        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json(['success' => false, 'message' => 'The provided credentials are incorrect.', 'errors' => ['email' => ['The provided credentials are incorrect.']]], 422);
        }

        $token = $user->createToken($request->string('device_name', 'web')->toString())->plainTextToken;

        return response()->json(['success' => true, 'message' => 'Login successful.', 'data' => ['user' => new UserResource($user), 'token' => $token]]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['success' => true, 'message' => 'Logout successful.', 'data' => (object) []]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Authenticated user retrieved.', 'data' => ['user' => new UserResource($request->user())]]);
    }
}
