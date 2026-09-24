<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\HasProcurementHelpers;
use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The supplier directory the flowchart's "Filter Supplier based on category (Goods, Services)"
 * picks from. Deactivating keeps a supplier on past RFQs but out of new canvasses.
 */
class SupplierController extends Controller
{
    use HasProcurementHelpers;

    public const CATEGORIES = ['Goods', 'Services'];

    public function index(Request $request): JsonResponse
    {
        $this->guardModule('rfq');

        $query = Supplier::query()->orderBy('name');

        if ($category = $request->query('category')) {
            $query->where('category', $category);
        }
        if ($request->has('active')) {
            $query->where('active', $request->boolean('active'));
        }
        if ($search = trim((string) $request->query('q'))) {
            $needle = '%'.mb_strtolower($search).'%';
            $query->where(fn ($q) => $q->whereRaw('LOWER(name) LIKE ?', [$needle])
                ->orWhereRaw('LOWER(COALESCE(email, \'\')) LIKE ?', [$needle])
                ->orWhereRaw('LOWER(COALESCE(address, \'\')) LIKE ?', [$needle]));
        }

        return response()->json($query->paginate(min((int) $request->query('per_page', 20), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $this->guardModule('rfq');
        $supplier = Supplier::create($this->validated($request) + ['active' => true]);
        $this->audit($request, 'Suppliers', 'Added supplier', $supplier->name);

        return response()->json(['data' => $supplier], 201);
    }

    public function show(Supplier $supplier): JsonResponse
    {
        $this->guardModule('rfq');

        return response()->json(['data' => $supplier]);
    }

    public function update(Request $request, Supplier $supplier): JsonResponse
    {
        $this->guardModule('rfq');
        $supplier->fill($this->validated($request, $supplier) + $request->validate(['active' => ['sometimes', 'boolean']]))->save();
        $this->audit($request, 'Suppliers', 'Updated supplier', $supplier->name);

        return response()->json(['data' => $supplier->fresh()]);
    }

    /** Deactivates rather than deletes: past canvasses keep pointing at the supplier. */
    public function destroy(Request $request, Supplier $supplier): JsonResponse
    {
        $this->guardModule('rfq');
        $supplier->forceFill(['active' => false])->save();
        $this->audit($request, 'Suppliers', 'Deactivated supplier', $supplier->name);

        return response()->json(['data' => $supplier->fresh()]);
    }

    private function validated(Request $request, ?Supplier $supplier = null): array
    {
        $required = $supplier ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$required, 'string', 'max:255', Rule::unique('suppliers', 'name')->where('category', $request->input('category', $supplier?->category))->ignore($supplier?->id)],
            'category' => [$required, Rule::in(self::CATEGORIES)],
            'address' => ['nullable', 'string', 'max:255'],
            'contact_no' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'tin' => ['nullable', 'string', 'max:255'],
        ]);
    }
}
