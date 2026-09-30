<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/** Only invoked against the isolated free-test database. */
class DemoLoginSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment('testing')) {
            throw new \RuntimeException('Demo profiles require the testing environment.');
        }

        foreach ([
            ['Maria Santos', 'maria.santos@dahonmd.test', 'farmer'],
            ['Dr. Ana Reyes', 'reviewer@dahonmd.test', 'agricultural_expert'],
            ['DahonMD Administrator', 'admin@dahonmd.test', 'admin'],
        ] as [$name, $email, $role]) {
            User::firstOrCreate(['email' => $email], [
                'name' => $name,
                'role' => $role,
                'email_verified_at' => now(),
                'password' => Hash::make('DahonMD@2026'),
            ]);
        }
    }
}
