<x-public-layout title="Reset password">
    <h1>Reset your DahonMD password</h1>
    @if (session('status')) <p class="notice">{{ session('status') }}</p> @endif
    @if ($errors->any()) <p class="error">{{ $errors->first() }}</p> @endif
    <form method="post" action="{{ url('/reset-password') }}">
        @csrf
        <input type="hidden" name="token" value="{{ $token }}">
        <label>Email address<input type="email" name="email" value="{{ old('email', $email) }}" autocomplete="email" required></label>
        <label>New password<input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
        <label>Confirm new password<input type="password" name="password_confirmation" autocomplete="new-password" minlength="8" required></label>
        <button type="submit">Set new password</button>
    </form>
</x-public-layout>
