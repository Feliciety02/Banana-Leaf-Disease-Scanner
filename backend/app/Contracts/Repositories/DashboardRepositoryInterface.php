<?php

namespace App\Contracts\Repositories;

interface DashboardRepositoryInterface
{
    public function snapshot(float $confidenceThreshold): array;
}
