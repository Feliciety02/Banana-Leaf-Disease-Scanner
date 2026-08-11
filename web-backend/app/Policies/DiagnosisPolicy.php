<?php

namespace App\Policies;

use App\Models\Diagnosis;
use App\Models\User;

class DiagnosisPolicy
{
    public function view(User $user, Diagnosis $diagnosis): bool
    {
        return $user->isAdmin() || $diagnosis->user_id === $user->id;
    }

    public function delete(User $user, Diagnosis $diagnosis): bool
    {
        return $user->isAdmin() || $diagnosis->user_id === $user->id;
    }
}
