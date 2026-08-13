<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::query()->create([...$request->validated(), 'password' => Hash::make($request->password), 'role' => 'farmer']);
        $user->sendEmailVerificationNotification();
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

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink(['email' => Str::lower($validated['email'])]);

        return response()->json([
            'success' => true,
            'message' => 'If an account exists for that email, a password reset link has been sent.',
            'data' => (object) [],
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)],
        ]);
        $credentials['email'] = Str::lower($credentials['email']);

        $status = Password::reset($credentials, function (User $user, string $password): void {
            $user->forceFill([
                'password' => Hash::make($password),
                'remember_token' => Str::random(60),
            ])->save();
            $user->tokens()->delete();
        });

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json([
                'success' => false,
                'message' => __($status),
                'errors' => ['email' => [__($status)]],
            ], 422);
        }

        return response()->json(['success' => true, 'message' => __($status), 'data' => (object) []]);
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

    public function resendVerification(Request $request): JsonResponse
    {
        if (! $request->user()->hasVerifiedEmail()) {
            $request->user()->sendEmailVerificationNotification();
        }

        return response()->json([
            'success' => true,
            'message' => $request->user()->hasVerifiedEmail()
                ? 'Your email address is already verified.'
                : 'A verification link has been sent.',
            'data' => (object) [],
        ]);
    }
}
