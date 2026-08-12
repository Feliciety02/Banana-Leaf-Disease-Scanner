<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DevelopmentUserSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->warn('Development users were not seeded in production.');

            return;
        }

        $password = env('DEV_USER_PASSWORD', 'DahonMD@2026');
        $users = [
            ['name' => 'DahonMD Administrator', 'email' => 'admin@dahonmd.test', 'role' => 'admin'],
            ['name' => 'Dr. Ana Reyes', 'email' => 'reviewer@dahonmd.test', 'role' => 'agricultural_expert'],
            ['name' => 'Maria Santos', 'email' => 'maria.santos@dahonmd.test', 'role' => 'farmer'],
        ];

        User::query()->whereIn('email', [
            'admin@bananacare.test',
            'maria.santos@bananacare.test',
            'juan.delacruz@bananacare.test',
            'liza.mercado@bananacare.test',
            'ramon.bautista@bananacare.test',
            'elena.villanueva@bananacare.test',
            'daniel.flores@bananacare.test',
            'juan.delacruz@dahonmd.test',
            'liza.mercado@dahonmd.test',
            'ramon.bautista@dahonmd.test',
            'elena.villanueva@dahonmd.test',
            'daniel.flores@dahonmd.test',
        ])->delete();

        foreach ($users as $user) {
            User::query()->updateOrCreate(
                ['email' => $user['email']],
                [
                    'name' => $user['name'],
                    'role' => $user['role'],
                    'email_verified_at' => now(),
                    'password' => Hash::make($password),
                ],
            );
        }
    }
}
