<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();
        DB::table('diseases')->upsert([
            ['slug' => 'healthy', 'name' => 'Healthy', 'scientific_name' => null, 'description' => 'No recognized disease indicators detected.', 'symptoms' => json_encode(['Even green coloration', 'Intact leaf surface']), 'management' => 'Continue routine field monitoring.', 'created_at' => $now, 'updated_at' => $now],
            ['slug' => 'black-sigatoka', 'name' => 'Black Sigatoka', 'scientific_name' => 'Pseudocercospora fijiensis', 'description' => 'Fungal leaf spot disease.', 'symptoms' => json_encode(['Dark elongated streaks', 'Yellowing tissue']), 'management' => 'Remove infected leaves and follow local crop guidance.', 'created_at' => $now, 'updated_at' => $now],
            ['slug' => 'yellow-sigatoka', 'name' => 'Yellow Sigatoka', 'scientific_name' => 'Pseudocercospora musae', 'description' => 'Fungal disease producing pale streaks and spots.', 'symptoms' => json_encode(['Pale yellow streaks', 'Brown oval spots']), 'management' => 'Reduce leaf wetness and prune infected material.', 'created_at' => $now, 'updated_at' => $now],
            ['slug' => 'fusarium-wilt', 'name' => 'Fusarium Wilt', 'scientific_name' => 'Fusarium oxysporum f. sp. cubense', 'description' => 'Soil-borne vascular disease.', 'symptoms' => json_encode(['Older leaves yellow first', 'Leaf margins wilt']), 'management' => 'Isolate affected plants and disinfect equipment.', 'created_at' => $now, 'updated_at' => $now],
            ['slug' => 'bunchy-top', 'name' => 'Banana Bunchy Top', 'scientific_name' => 'Banana bunchy top virus', 'description' => 'Viral disease spread by banana aphids.', 'symptoms' => json_encode(['Dark dot-dash veins', 'Bunched upright crown']), 'management' => 'Do not propagate affected plants and control aphids.', 'created_at' => $now, 'updated_at' => $now],
        ], ['slug'], ['name', 'scientific_name', 'description', 'symptoms', 'management', 'updated_at']);

        if ($email = env('DEV_ADMIN_EMAIL')) {
            $password = env('DEV_ADMIN_PASSWORD');
            if (! $password) {
                throw new \RuntimeException('DEV_ADMIN_PASSWORD is required when DEV_ADMIN_EMAIL is set.');
            }
            User::query()->updateOrCreate(
                ['email' => $email],
                ['name' => env('DEV_ADMIN_NAME', 'Development Administrator'), 'role' => 'admin', 'password' => Hash::make($password)],
            );
        }
    }
}
