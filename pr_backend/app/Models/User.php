<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /** Every module the platform exposes, in sidebar order. */
    public const ALL_MODULES = [
        'dashboard', 'pr', 'lib', 'ppmp', 'rfq', 'validation', 'approvals', 'references', 'reports', 'users', 'audit', 'settings',
    ];

    /** Modules a Superadmin can grant/revoke on an individual regular account. */
    public const TOGGLEABLE_MODULES = [
        'pr', 'lib', 'ppmp', 'rfq', 'validation', 'approvals', 'references', 'reports',
    ];

    /** What a regular account gets before any Superadmin customization. */
    public const REGULAR_DEFAULT_MODULES = ['pr', 'lib', 'ppmp'];

    protected $fillable = [
        'name',
        'email',
        'password',
        'office_id',
        'position',
        'status',
        'tier',
        'modules',
        'signature',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        // Large base64 image — never ship it in generic user payloads; use has_signature.
        'signature',
    ];

    /** Expose the computed effective module list + signature presence to the API. */
    protected $appends = ['access_modules', 'has_signature'];

    public function getHasSignatureAttribute(): bool
    {
        return ! empty($this->signature);
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class);
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class)->withTimestamps();
    }

    /**
     * Resolve the modules this user may actually access.
     * Superadmin: everything. Admin (Supply): everything except user management.
     * Regular: dashboard + its granted toggleable modules (defaults to PR/LIB/PPMP).
     *
     * @return array<int, string>
     */
    public function effectiveModules(): array
    {
        if ($this->tier === 'superadmin') {
            return self::ALL_MODULES;
        }

        if ($this->tier === 'admin') {
            return array_values(array_diff(self::ALL_MODULES, ['users']));
        }

        $granted = is_array($this->modules) && $this->modules !== []
            ? array_values(array_intersect($this->modules, self::TOGGLEABLE_MODULES))
            : self::REGULAR_DEFAULT_MODULES;

        return array_values(array_unique(array_merge(['dashboard'], $granted)));
    }

    public function canAccessModule(string $module): bool
    {
        return in_array($module, $this->effectiveModules(), true);
    }

    /**
     * @return array<int, string>
     */
    public function getAccessModulesAttribute(): array
    {
        return $this->effectiveModules();
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'modules' => 'array',
        ];
    }
}
