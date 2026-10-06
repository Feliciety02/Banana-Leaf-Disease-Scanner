<x-public-layout title="Delete account">
    <h1>Delete your DahonMD account</h1>
    <p>This permanently removes your account, access tokens, scans, and scan photos. A separately approved research copy remains unless you choose to remove it below. This cannot be undone.</p>
    @if (session('status')) <p class="notice">{{ session('status') }}</p> @endif
    @if ($errors->any()) <p class="error">{{ $errors->first() }}</p> @endif
    <form method="post" action="{{ route('account-deletion') }}">
        @csrf
        <label>Email address<input type="email" name="email" value="{{ old('email') }}" autocomplete="email" required></label>
        <label>Current password<input type="password" name="password" autocomplete="current-password" required></label>
        <label><input type="checkbox" name="remove_research_copies" value="1" {{ old('remove_research_copies') ? 'checked' : '' }}> Also remove my approved research photos</label>
        <button type="submit">Permanently delete account</button>
    </form>
</x-public-layout>
