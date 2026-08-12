<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = User::query()->withCount('diagnoses')->withMax('diagnoses', 'diagnosed_at')->latest();
        $query->when($request->filled('search'), fn ($q) => $q->where(fn ($inner) => $inner->where('name', 'like', '%'.$request->search.'%')->orWhere('email', 'like', '%'.$request->search.'%')))
            ->when($request->filled('role'), fn ($q) => $q->where('role', $request->role));
        $paginator = $query->paginate(min($request->integer('per_page', 25), 100));

        return response()->json(['success' => true, 'message' => 'Users retrieved.', 'data' => ['items' => UserResource::collection($paginator->getCollection()), 'pagination' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()]]]);
    }

    public function indexFarmers(Request $request): JsonResponse
    {
        $request->merge(['role' => 'farmer']);

        return $this->index($request);
    }

    public function show(User $user): JsonResponse
    {
        return response()->json(['success' => true, 'message' => 'Account retrieved.', 'data' => new UserResource($user->loadCount('diagnoses')->loadMax('diagnoses', 'diagnosed_at'))]);
    }

    public function showFarmer(User $user): JsonResponse
    {
        abort_unless($user->isFarmer(), 404);

        return $this->show($user);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['password'] = Hash::make($data['password']);

        return response()->json(['success' => true, 'message' => 'User created.', 'data' => new UserResource(User::query()->create($data))], 201);
    }

    public function storeFarmer(StoreUserRequest $request): JsonResponse
    {
        $data = [...$request->validated(), 'role' => 'farmer'];
        $data['password'] = Hash::make($data['password']);

        return response()->json(['success' => true, 'message' => 'Farmer created.', 'data' => new UserResource(User::query()->create($data))], 201);
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $data = $request->validated();
        if ($request->user()->is($user) && ($data['role'] ?? 'admin') !== 'admin') {
            return response()->json(['success' => false, 'message' => 'You cannot remove your own administrator role.', 'errors' => ['role' => ['Choose another administrator to make this change.']]], 422);
        }
        if (empty($data['password'])) {
            unset($data['password']);
        } else {
            $data['password'] = Hash::make($data['password']);
        }
        $user->update($data);

        return response()->json(['success' => true, 'message' => 'User updated.', 'data' => new UserResource($user->fresh())]);
    }

    public function updateFarmer(UpdateUserRequest $request, User $user): JsonResponse
    {
        abort_unless($user->isFarmer(), 404);
        $data = [...$request->validated(), 'role' => 'farmer'];
        if (empty($data['password'])) {
            unset($data['password']);
        } else {
            $data['password'] = Hash::make($data['password']);
        }
        $user->update($data);

        return response()->json(['success' => true, 'message' => 'Farmer updated.', 'data' => new UserResource($user->fresh())]);
    }

    public function destroyFarmer(Request $request, User $user): JsonResponse
    {
        abort_unless($user->isFarmer(), 404);

        return $this->destroy($request, $user);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($request->user()->is($user)) {
            return response()->json(['success' => false, 'message' => 'The currently authenticated administrator cannot be deleted.', 'errors' => (object) []], 422);
        }
        $user->delete();

        return response()->json(status: 204);
    }
}
