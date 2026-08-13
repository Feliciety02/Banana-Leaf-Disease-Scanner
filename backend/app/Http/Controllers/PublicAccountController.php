<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\View\View;
use Symfony\Component\HttpFoundation\Response;

class PublicAccountController extends Controller
{
    public function privacy(): View
    {
        return view('privacy', ['contactEmail' => config('app.privacy_contact_email')]);
    }

    public function deletionForm(): View
    {
        return view('account-deletion');
    }

    public function destroy(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);
        $user = User::query()->where('email', Str::lower($validated['email']))->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            return back()->withErrors(['email' => 'The account credentials could not be verified.'])->onlyInput('email');
        }

        $user->tokens()->delete();
        $user->delete();

        return back()->with('status', 'Your DahonMD account and associated server data were deleted.');
    }

    public function resetForm(Request $request): View
    {
        return view('reset-password', [
            'email' => $request->string('email')->toString(),
            'token' => $request->string('token')->toString(),
        ]);
    }

    public function reset(Request $request): RedirectResponse
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

        return $status === Password::PASSWORD_RESET
            ? back()->with('status', __($status))
            : back()->withErrors(['email' => __($status)])->onlyInput('email');
    }

    public function verifyEmail(Request $request, int $id, string $hash): Response
    {
        $user = User::query()->findOrFail($id);
        abort_unless(hash_equals($hash, sha1($user->getEmailForVerification())), 403);

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        return response()->view('email-verified');
    }
}
