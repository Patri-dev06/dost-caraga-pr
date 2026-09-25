<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

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
        // Keyed by email + IP so one attacker can't lock out everyone behind a shared office IP,
        // while still capping guesses against a single account.
        RateLimiter::for('login', fn (Request $request) => config('auth.throttle_enabled')
            ? Limit::perMinute((int) config('auth.login_attempts_per_minute'))
                ->by(strtolower((string) $request->input('email')).'|'.$request->ip())
            : Limit::none());

        RateLimiter::for('register', fn (Request $request) => config('auth.throttle_enabled')
            ? Limit::perHour((int) config('auth.register_attempts_per_hour'))->by($request->ip())
            : Limit::none());
    }
}
