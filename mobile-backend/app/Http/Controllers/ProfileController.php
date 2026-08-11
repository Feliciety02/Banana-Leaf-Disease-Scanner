<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class ProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Profile retrieved.', 'data' => ['user' => new UserResource($request->user())]]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'email' => ['required', 'email', Rule::unique('users')->ignore($request->user()->id)]]);
        $request->user()->update($data);

        return response()->json(['success' => true, 'message' => 'Profile updated.', 'data' => ['user' => new UserResource($request->user()->fresh())]]);
    }

    public function password(Request $request): JsonResponse
    {
        $data = $request->validate(['current_password' => ['required', 'current_password'], 'password' => ['required', 'confirmed', Password::min(8)]]);
        $request->user()->update(['password' => Hash::make($data['password'])]);

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
