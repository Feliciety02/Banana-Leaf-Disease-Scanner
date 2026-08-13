<?php

namespace App\Policies;

use App\Models\Disease;
use App\Models\User;

class DiseasePolicy
{
    public function viewAny(?User $user): bool
    {
        return true;
    }

    public function view(?User $user, Disease $disease): bool
    {
        return true;
    }

    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, Disease $disease): bool
    {
        return $user->isAdmin();
    }

    public function delete(User $user, Disease $disease): bool
    {
        return $user->isAdmin();
    }
}
