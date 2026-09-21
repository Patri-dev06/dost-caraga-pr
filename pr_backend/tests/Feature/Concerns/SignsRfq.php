<?php

namespace Tests\Feature\Concerns;

use Illuminate\Testing\TestResponse;

trait SignsRfq
{
    /** Seeded account designated for each RFQ signing step (see DatabaseSeeder / BacUsersSeeder). */
    private const RFQ_SIGNATORY_EMAILS = [
        'bac-chair' => 'jbautista.bac@dost.gov.ph',
        'bac-vice-chair' => 'rsantiago.bac@dost.gov.ph',
        'supply-officer' => 'admin@dost.gov.ph',
    ];

    /** A request acting as the designated BAC 'chair' or 'vice-chair' (the only accounts allowed to review an AOC). */
    private function asBac(string $who = 'chair'): static
    {
        $email = self::RFQ_SIGNATORY_EMAILS[$who === 'chair' ? 'bac-chair' : 'bac-vice-chair'];
        $token = $this->postJson('/api/v1/auth/login', ['email' => $email, 'password' => 'password123'])->json('token');

        return $this->withToken($token);
    }

    /** Signs one RFQ step as the account actually designated for it. */
    private function signRfq(int $rfqId, string $step): TestResponse
    {
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => self::RFQ_SIGNATORY_EMAILS[$step],
            'password' => 'password123',
        ])->json('token');

        return $this->withToken($token)->postJson("/api/v1/rfqs/{$rfqId}/sign/{$step}");
    }
}
