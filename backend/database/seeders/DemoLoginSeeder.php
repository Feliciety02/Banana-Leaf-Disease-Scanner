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

        // The demo agriculturist used to sign in as reviewer@; keep that account and its review history.
        User::query()->where('email', 'reviewer@dahonmd.test')
            ->whereNotExists(fn ($query) => $query->from('users', 'existing')->where('existing.email', 'agriculturist@dahonmd.test'))
            ->update(['email' => 'agriculturist@dahonmd.test']);

        foreach ([
            ['Maria Santos', 'maria.santos@dahonmd.test', 'farmer'],
            ['Dr. Ana Reyes', 'agriculturist@dahonmd.test', 'agricultural_expert'],
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
