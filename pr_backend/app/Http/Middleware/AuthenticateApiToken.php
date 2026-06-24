<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateApiToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $plainToken = $request->bearerToken();

        if (! $plainToken) {
            return response()->json(['code' => 'unauthenticated', 'message' => 'Bearer token is required.'], 401);
        }

        $token = ApiToken::with('user.roles', 'user.office')
            ->where('token_hash', hash('sha256', $plainToken))
            ->where('expires_at', '>', now())
            ->first();

        if (! $token) {
            return response()->json(['code' => 'invalid_token', 'message' => 'The provided token is invalid or expired.'], 401);
        }

        $idleTimeoutMinutes = (int) config('auth.api_token_idle_timeout', 30);
        $lastActivity = $token->last_used_at ?? $token->created_at;

        if ($idleTimeoutMinutes > 0 && $lastActivity?->lt(now()->subMinutes($idleTimeoutMinutes))) {
            $token->delete();

            return response()->json(['code' => 'token_idle_timeout', 'message' => 'Your session timed out due to inactivity.'], 401);
        }

        $token->forceFill(['last_used_at' => now()])->save();
        $request->setUserResolver(fn () => $token->user);

        return $next($request);
    }
}
