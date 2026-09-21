<?php

namespace Database\Seeders;

use App\Models\Office;
use App\Models\Role;
use App\Models\SystemPreference;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class BacUsersSeeder extends Seeder
{
    // Placeholder 1x1 PNG so these accounts pass the requireSignature() gate
    // used by every RFQ/AOC digital-sign step (see DatabaseSeeder's admin user).
    private const PLACEHOLDER_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    public function run(): void
    {
        $office = Office::firstWhere('code', 'RO') ?? Office::first();

        $approverRole = Role::firstWhere('name', 'Approver');

        $bacChair = User::updateOrCreate(['email' => 'jbautista.bac@dost.gov.ph'], [
            'name' => 'Josefina Bautista',
            'password' => Hash::make('password123'),
            'office_id' => $office?->id,
            'position' => 'BAC Chairman',
            'status' => 'Active',
            'tier' => 'regular',
            'modules' => ['rfq', 'approvals'],
            'signature' => self::PLACEHOLDER_SIGNATURE,
        ]);
        if ($approverRole) {
            $bacChair->roles()->sync([$approverRole->id]);
        }

        $bacViceChair = User::updateOrCreate(['email' => 'rsantiago.bac@dost.gov.ph'], [
            'name' => 'Ramon Santiago',
            'password' => Hash::make('password123'),
            'office_id' => $office?->id,
            'position' => 'BAC Vice-Chairman',
            'status' => 'Active',
            'tier' => 'regular',
            'modules' => ['rfq', 'approvals'],
            'signature' => self::PLACEHOLDER_SIGNATURE,
        ]);
        if ($approverRole) {
            $bacViceChair->roles()->sync([$approverRole->id]);
        }

        $members = collect([
            ['email' => 'lreyes.bac@dost.gov.ph', 'name' => 'Liza Reyes'],
            ['email' => 'ecatapang.bac@dost.gov.ph', 'name' => 'Edgar Catapang'],
            ['email' => 'mfernandez.bac@dost.gov.ph', 'name' => 'Marites Fernandez'],
        ])->map(function (array $data) use ($office, $approverRole) {
            $member = User::updateOrCreate(['email' => $data['email']], [
                'name' => $data['name'],
                'password' => Hash::make('password123'),
                'office_id' => $office?->id,
                'position' => 'BAC Member',
                'status' => 'Active',
                'tier' => 'regular',
                'modules' => ['rfq', 'approvals'],
                'signature' => self::PLACEHOLDER_SIGNATURE,
            ]);
            if ($approverRole) {
                $member->roles()->sync([$approverRole->id]);
            }

            return $member;
        });

        // Point the designated-signatory preferences at the new Chair/Vice-Chair
        // accounts instead of the default admin@dost.gov.ph fallback, otherwise
        // RfqController::advanceRfqSigning() keeps rejecting these users with a
        // 403 "You are not the designated ... signatory."
        SystemPreference::updateOrCreate(
            ['key' => 'bac_chair_user_id'],
            [
                'value' => ['value' => $bacChair->id],
                'category' => 'Workflow',
                'label' => 'BAC Chairman',
                'description' => 'Account that signs an RFQ first, before it can be sent to suppliers.',
                'type' => 'text',
            ]
        );

        SystemPreference::updateOrCreate(
            ['key' => 'bac_vice_chair_user_id'],
            [
                'value' => ['value' => $bacViceChair->id],
                'category' => 'Workflow',
                'label' => 'BAC Vice-Chairman',
                'description' => 'Account that signs an RFQ after the BAC Chairman.',
                'type' => 'text',
            ]
        );

        $this->command?->info('BAC Chair: jbautista.bac@dost.gov.ph');
        $this->command?->info('BAC Vice-Chair: rsantiago.bac@dost.gov.ph');
        $this->command?->info('BAC Members: '.$members->pluck('email')->implode(', '));
        $this->command?->info('Password for all: password123');
    }
}
