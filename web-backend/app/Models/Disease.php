<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Disease extends Model
{
    use HasFactory;

    protected $fillable = ['slug', 'name', 'scientific_name', 'description', 'symptoms', 'management', 'prevention', 'image_path'];

    protected function casts(): array
    {
        return ['symptoms' => 'array'];
    }

    public function diagnoses(): HasMany
    {
        return $this->hasMany(Diagnosis::class);
    }
}
