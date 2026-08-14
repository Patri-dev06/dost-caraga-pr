<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiToken;
use App\Models\AuditLog;
use App\Models\Office;
use App\Models\Role;
use App\Models\SystemPreference;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
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
            'user' => $this->serializeUser($user->fresh(['roles', 'office'])),
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8'],
            'position' => ['required', 'string', 'max:255'],
            'office_id' => ['required', 'exists:offices,id'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'position' => $data['position'],
            'office_id' => $data['office_id'],
            'status' => 'Pending',
            'tier' => 'regular',
            'modules' => User::REGULAR_DEFAULT_MODULES,
        ]);

        if ($requesterRole = Role::where('name', 'Requester')->first()) {
            $user->roles()->sync([$requesterRole->id]);
        }

        $this->audit($request, $user, 'Auth', 'Registered (Pending Approval)', $user->email);

        return response()->json([
            'message' => 'Registration submitted. An administrator will review and activate your account.',
            'data' => $user->load('office', 'roles'),
        ], 201);
    }

    /** Public office list used to populate the registration form. */
    public function offices(): JsonResponse
    {
        return response()->json([
            'data' => Office::query()->orderBy('name')->get(['id', 'name', 'code']),
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
        return response()->json(['data' => $this->serializeUser($request->user()->load('roles', 'office'))]);
    }

    /** Self-service profile update. Only the account's own editable fields — never
     *  tier/status/modules/roles, which stay under Superadmin control. */
    public function updateMe(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'position' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $user->fill($data)->save();
        $this->audit($request, $user, 'Account', 'Updated Profile', $user->email);

        return response()->json(['data' => $this->serializeUser($user->fresh(['roles', 'office']))]);
    }

    /** User payload plus the derived is_budget_officer flag used by the client. */
    private function serializeUser(User $user): array
    {
        $pref = fn (string $key) => optional(SystemPreference::where('key', $key)->first())->value['value'] ?? null;
        $budgetOfficerId = $pref('budget_officer_user_id');
        $supervisorId = $pref('supervisor_user_id');
        $regionalDirectorId = $pref('regional_director_user_id');

        return array_merge($user->toArray(), [
            'is_budget_officer' => $budgetOfficerId !== null && (int) $budgetOfficerId === $user->id,
            'is_supervisor' => $supervisorId !== null && (int) $supervisorId === $user->id,
            'is_regional_director' => $regionalDirectorId !== null && (int) $regionalDirectorId === $user->id,
        ]);
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
