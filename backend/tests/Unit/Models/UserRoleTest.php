<?php

namespace Tests\Unit\Models;

use App\Models\User;
use PHPUnit\Framework\TestCase;

class UserRoleTest extends TestCase
{
    public function test_role_checks_share_one_allow_list_without_a_database(): void
    {
        $user = new User(['role' => User::ROLE_AGRICULTURAL_EXPERT]);

        $this->assertTrue($user->isAgriculturalExpert());
        $this->assertTrue($user->hasRole(User::ROLE_ADMIN, User::ROLE_AGRICULTURAL_EXPERT));
        $this->assertFalse($user->isAdmin());
        $this->assertFalse($user->isFarmer());
        $this->assertSame(['farmer', 'agricultural_expert', 'admin'], User::ROLES);
    }
}
