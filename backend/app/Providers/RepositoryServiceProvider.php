<?php

namespace App\Providers;

use App\Contracts\Repositories\DashboardRepositoryInterface;
use App\Contracts\Repositories\DatasetCandidateRepositoryInterface;
use App\Contracts\Repositories\DiagnosisRepositoryInterface;
use App\Contracts\Repositories\DiseaseRepositoryInterface;
use App\Contracts\Repositories\ResearchSourceRepositoryInterface;
use App\Contracts\Repositories\UserRepositoryInterface;
use App\Repositories\DashboardRepository;
use App\Repositories\DatasetCandidateRepository;
use App\Repositories\DiagnosisRepository;
use App\Repositories\DiseaseRepository;
use App\Repositories\ResearchSourceRepository;
use App\Repositories\UserRepository;
use Illuminate\Support\ServiceProvider;

class RepositoryServiceProvider extends ServiceProvider
{
    public array $bindings = [
        UserRepositoryInterface::class => UserRepository::class,
        DatasetCandidateRepositoryInterface::class => DatasetCandidateRepository::class,
        DashboardRepositoryInterface::class => DashboardRepository::class,
        DiagnosisRepositoryInterface::class => DiagnosisRepository::class,
        DiseaseRepositoryInterface::class => DiseaseRepository::class,
        ResearchSourceRepositoryInterface::class => ResearchSourceRepository::class,
    ];
}
