<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(DevelopmentUserSeeder::class);
        $this->call(ScientificKnowledgeSeeder::class);
    }
}
