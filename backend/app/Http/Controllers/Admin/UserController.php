<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\UserManagementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function __construct(private readonly UserManagementService $users) {}

    public function index(Request $request): JsonResponse
    {
        $filters = [];
        foreach (['search', 'role'] as $filter) {
            if ($request->filled($filter)) {
                $filters[$filter] = $request->string($filter)->toString();
            }
        }
        $paginator = $this->users->paginate($filters, $request->integer('per_page', 25));

        return response()->json(['success' => true, 'message' => 'Users retrieved.', 'data' => ['items' => UserResource::collection($paginator->getCollection()), 'pagination' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()]]]);
    }

    public function indexFarmers(Request $request): JsonResponse
    {
        $request->merge(['role' => User::ROLE_FARMER]);

        return $this->index($request);
    }

    public function indexExperts(Request $request): JsonResponse
    {
        $request->merge(['role' => User::ROLE_AGRICULTURAL_EXPERT]);

        return $this->index($request);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Account retrieved.', 'data' => new UserResource($this->users->details($user))]);
    }

    public function showFarmer(User $user): JsonResponse
    {
        abort_unless($user->isFarmer(), 404);

        return $this->show($user);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'User created.', 'data' => new UserResource($this->users->create($request->validated()))], 201);
    }

    public function storeFarmer(StoreUserRequest $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Farmer created.', 'data' => new UserResource($this->users->create($request->validated(), User::ROLE_FARMER))], 201);
    }

    public function storeExpert(StoreUserRequest $request): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Agricultural reviewer created.', 'data' => new UserResource($this->users->create($request->validated(), User::ROLE_AGRICULTURAL_EXPERT))], 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $data = $request->validated();
        if ($request->user()->is($user) && ($data['role'] ?? User::ROLE_ADMIN) !== User::ROLE_ADMIN) {
            return response()->json(['success' => false, 'message' => 'You cannot remove your own administrator role.', 'errors' => ['role' => ['Choose another administrator to make this change.']]], 422);
        }
        $user = $this->users->update($user, $data);

        return response()->json(['success' => true, 'message' => 'User updated.', 'data' => new UserResource($user)]);
    }

    public function updateFarmer(UpdateUserRequest $request, User $user): JsonResponse
    {
        abort_unless($user->isFarmer(), 404);
        $user = $this->users->update($user, $request->validated(), User::ROLE_FARMER);

        return response()->json(['success' => true, 'message' => 'Farmer updated.', 'data' => new UserResource($user)]);
    }

    public function updateExpert(UpdateUserRequest $request, User $user): JsonResponse
    {
        abort_unless($user->isAgriculturalExpert(), 404);
        $user = $this->users->update($user, $request->validated(), User::ROLE_AGRICULTURAL_EXPERT);

        return response()->json(['success' => true, 'message' => 'Agricultural reviewer updated.', 'data' => new UserResource($user)]);
    }

    public function destroyFarmer(Request $request, User $user): JsonResponse
    {
        abort_unless($user->isFarmer(), 404);

        return $this->destroy($request, $user);
    }

    public function destroyExpert(Request $request, User $user): JsonResponse
    {
        abort_unless($user->isAgriculturalExpert(), 404);

        return $this->destroy($request, $user);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($request->user()->is($user)) {
            return response()->json(['success' => false, 'message' => 'The currently authenticated administrator cannot be deleted.', 'errors' => (object) []], 422);
        }
        $this->users->delete($user);

        return response()->json(status: 204);
    }
}
