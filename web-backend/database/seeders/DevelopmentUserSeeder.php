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
            ['name' => 'Maria Santos', 'email' => 'maria.santos@dahonmd.test', 'role' => 'farmer'],
            ['name' => 'Juan Dela Cruz', 'email' => 'juan.delacruz@dahonmd.test', 'role' => 'farmer'],
            ['name' => 'Liza Mercado', 'email' => 'liza.mercado@dahonmd.test', 'role' => 'farmer'],
            ['name' => 'Ramon Bautista', 'email' => 'ramon.bautista@dahonmd.test', 'role' => 'farmer'],
            ['name' => 'Elena Villanueva', 'email' => 'elena.villanueva@dahonmd.test', 'role' => 'farmer'],
            ['name' => 'Daniel Flores', 'email' => 'daniel.flores@dahonmd.test', 'role' => 'farmer'],
        ];

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
