<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'email' => ['required', 'email', 'max:255', 'unique:users,email'], 'password' => ['required', 'confirmed', Password::min(8)]]);
        $user = User::query()->create([...$data, 'password' => Hash::make($data['password']), 'role' => 'user']);

        return response()->json(['success' => true, 'message' => 'Registration successful.', 'data' => ['user' => new UserResource($user), 'token' => $user->createToken('mobile')->plainTextToken]], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $user = User::query()->where('email', $data['email'])->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['success' => false, 'message' => 'The provided credentials are incorrect.', 'errors' => ['email' => ['The provided credentials are incorrect.']]], 422);
        }

        return response()->json(['success' => true, 'message' => 'Login successful.', 'data' => ['user' => new UserResource($user), 'token' => $user->createToken('mobile')->plainTextToken]]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Authenticated user retrieved.', 'data' => ['user' => new UserResource($request->user())]]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['success' => true, 'message' => 'Logout successful.', 'data' => (object) []]);
    }
}
