<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ResetPassword::createUrlUsing(fn (object $notifiable, string $token): string => url('/reset-password').'?'.http_build_query([
            'token' => $token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]));

        RateLimiter::for('auth', function (Request $request) {
            $identity = Str::lower((string) $request->input('email', 'anonymous'));

            return Limit::perMinute(10)->by($identity.'|'.$request->ip());
        });

        RateLimiter::for('public-api', fn (Request $request) => Limit::perMinute(60)->by($request->ip()));
        RateLimiter::for('authenticated-api', fn (Request $request) => Limit::perMinute(120)->by((string) ($request->user()?->getAuthIdentifier() ?? $request->ip())));
        RateLimiter::for('sync', fn (Request $request) => Limit::perMinute(20)->by((string) ($request->user()?->getAuthIdentifier() ?? $request->ip())));
    }
}
