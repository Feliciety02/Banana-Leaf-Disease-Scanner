<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Disease extends Model
{
    use HasFactory;

    protected $fillable = ['slug', 'name', 'scientific_name', 'description', 'symptoms', 'management'];

    protected function casts(): array
    {
        return ['symptoms' => 'array'];
    }
}
