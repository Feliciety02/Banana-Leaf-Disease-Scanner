<?php

namespace App\Http\Controllers;

use App\Services\AccountService;
use App\Services\AuthenticationService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\View\View;
use Symfony\Component\HttpFoundation\Response;

class PublicAccountController extends Controller
{
    public function __construct(
        private readonly AccountService $accounts,
        private readonly AuthenticationService $auth,
    ) {}

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
        $user = $this->accounts->credentialsMatch($validated['email'], $validated['password']);
        if (! $user) {
            return back()->withErrors(['email' => 'The account credentials could not be verified.'])->onlyInput('email');
        }

        $this->accounts->delete($user);

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
        $status = $this->auth->resetPassword($credentials);

        return $status === Password::PASSWORD_RESET
            ? back()->with('status', __($status))
            : back()->withErrors(['email' => __($status)])->onlyInput('email');
    }

    public function verifyEmail(Request $request, int $id, string $hash): Response
    {
        $this->accounts->verifyEmail($id, $hash);

        return response()->view('email-verified');
    }
}
