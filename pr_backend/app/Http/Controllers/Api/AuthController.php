<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiToken;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::with('roles', 'office')->where('email', $credentials['email'])->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password) || $user->status !== 'Active') {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are invalid or the user is inactive.'],
            ]);
        }

        $plainToken = Str::random(80);
        $expiresAt = now()->addHours(8);

        ApiToken::create([
            'user_id' => $user->id,
            'name' => 'api',
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => $expiresAt,
            'last_used_at' => now(),
        ]);

        $user->forceFill(['last_login_at' => now()])->save();
        $this->audit($request, $user, 'Auth', 'Logged In', $user->email);

        return response()->json([
            'token' => $plainToken,
            'token_type' => 'Bearer',
            'expires_in' => now()->diffInSeconds($expiresAt),
            'user' => $user->fresh(['roles', 'office']),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->bearerToken();
        ApiToken::where('token_hash', hash('sha256', (string) $token))->delete();
        $this->audit($request, $request->user(), 'Auth', 'Logged Out', $request->user()->email);

        return response()->json(['message' => 'Logged out.']);
    }

    public function refresh(Request $request): JsonResponse
    {
        $this->logout($request);

        $plainToken = Str::random(80);
        $expiresAt = now()->addHours(8);

        ApiToken::create([
            'user_id' => $request->user()->id,
            'name' => 'api',
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => $expiresAt,
            'last_used_at' => now(),
        ]);

        return response()->json([
            'token' => $plainToken,
            'token_type' => 'Bearer',
            'expires_in' => now()->diffInSeconds($expiresAt),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->load('roles', 'office')]);
    }

    private function audit(Request $request, ?User $user, string $module, string $action, ?string $target = null): void
    {
        AuditLog::create([
            'actor_id' => $user?->id,
            'actor_name' => $user?->name,
            'role' => $user?->roles->pluck('name')->implode(', '),
            'module' => $module,
            'action' => $action,
            'target' => $target,
            'ip_address' => $request->ip(),
            'created_at' => now(),
        ]);
    }
}
