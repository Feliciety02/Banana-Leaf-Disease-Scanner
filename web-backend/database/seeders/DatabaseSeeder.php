<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call(DevelopmentUserSeeder::class);

        // Disease records are deliberately not seeded. They may be created only after the
        // final five-class label map is supplied and their research dossiers are validated.
    }
}
