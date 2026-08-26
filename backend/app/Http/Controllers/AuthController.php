<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Services\AuthenticationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    public function __construct(private readonly AuthenticationService $auth) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        $authentication = $this->auth->register(
            $request->validated(),
            $request->string('device_name', 'web')->toString(),
        );

        return response()->json(['success' => true, 'message' => 'Registration successful.', 'data' => [
            'user' => new UserResource($authentication['user']),
            'token' => $authentication['token'],
        ]], 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $authentication = $this->auth->authenticate(
            $request->string('email')->toString(),
            $request->password,
            $request->string('device_name', 'web')->toString(),
        );
        if (! $authentication) {
            return response()->json(['success' => false, 'message' => 'The provided credentials are incorrect.', 'errors' => ['email' => ['The provided credentials are incorrect.']]], 422);
        }

        return response()->json(['success' => true, 'message' => 'Login successful.', 'data' => [
            'user' => new UserResource($authentication['user']),
            'token' => $authentication['token'],
        ]]);
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
        $status = $this->auth->resetPassword($credentials);

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
        $this->auth->logout($request->user());

        return response()->json(['success' => true, 'message' => 'Logout successful.', 'data' => (object) []]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Authenticated user retrieved.', 'data' => ['user' => new UserResource($request->user())]]);
    }

    public function resendVerification(Request $request): JsonResponse
    {
        $sent = $this->auth->resendVerification($request->user());

        return response()->json([
            'success' => true,
            'message' => $sent ? 'A verification link has been sent.' : 'Your email address is already verified.',
            'data' => (object) [],
        ]);
    }
}
