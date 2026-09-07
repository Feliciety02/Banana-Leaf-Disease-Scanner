<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | Requests from the following hosts / domains will receive stateful API
    | authentication cookies. Typically, these should include your local and
    | production domains which access your API via a frontend SPA.
    |
    */

    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', sprintf(
        '%s%s',
        'localhost,localhost:3000,localhost:4173,127.0.0.1,127.0.0.1:4173,127.0.0.1:8000,::1',
        env('APP_URL') ? ','.parse_url(env('APP_URL'), PHP_URL_HOST) : ''
    ))),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | This array contains the authentication guards that will be checked when
    | Sanctum is trying to authenticate a request. If none of these guards
    | are able to authenticate the request, Sanctum will use the bearer token
    | (if any) on the incoming request.
    |
    */

    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | This value controls the number of minutes until an issued access token
    | will be considered expired. This is the "default" lifetime used for
    | normal (non "remember me") sessions. Remember-me sessions may be
    | configured with a longer lifetime via SANCTUM_TOKEN_REMEMBER_DAYS.
    |
    */

    'expiration' => (int) env('SANCTUM_TOKEN_TTL_MINUTES', 1440),

    /*
    |--------------------------------------------------------------------------
    | Remember-Me Token Lifetime (Days)
    |--------------------------------------------------------------------------
    |
    | This value controls how many days an access token issued for a "remember
    | me" session remains valid. It defaults to 30 days.
    |
    */

    'remember_days' => (int) env('SANCTUM_TOKEN_REMEMBER_DAYS', 30),

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    */

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    */

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],

];
