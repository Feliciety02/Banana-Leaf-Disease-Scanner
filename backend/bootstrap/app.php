<?php

use App\Http\Middleware\AssignRequestContext;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureAgriculturalExpert;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [AssignRequestContext::class]);
        $middleware->alias(['admin' => EnsureAdmin::class, 'agricultural_expert' => EnsureAgriculturalExpert::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*'));
        $exceptions->render(fn (ValidationException $e, Request $request) => $request->is('api/*') ? response()->json(['success' => false, 'message' => 'The given data was invalid.', 'errors' => $e->errors()], 422) : null);
        $exceptions->render(fn (AuthenticationException $e, Request $request) => $request->is('api/*') ? response()->json(['success' => false, 'message' => 'Unauthenticated.', 'errors' => (object) []], 401) : null);
        $exceptions->render(fn (AuthorizationException $e, Request $request) => $request->is('api/*') ? response()->json(['success' => false, 'message' => 'This action is forbidden.', 'errors' => (object) []], 403) : null);
    })->create();
