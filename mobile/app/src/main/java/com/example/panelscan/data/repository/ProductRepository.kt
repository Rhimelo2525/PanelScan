package com.example.panelscan.data.repository

import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.model.PVCPanel
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.Serializable
import kotlin.math.roundToInt

sealed interface Resource<out T> {
    data class Success<T>(val data: T) : Resource<T>
    data class Loading<T>(val cachedData: T? = null) : Resource<T>
    data class Error<T>(val message: String, val cachedData: T? = null) : Resource<T>
}

/**
 * The PanelScan catalogue from the backend (GET /api/products): the same
 * active products, stock and prices as the website. Prices come back only for
 * a signed-in customer, so the catalogue is reloaded after logging in or out.
 * The last load is kept in [ProductCatalog] for every screen to read.
 */
class ProductRepository(private val api: ApiClient) {

    val panels: StateFlow<List<PVCPanel>> = ProductCatalog.panels

    fun getAllPanels(): List<PVCPanel> = ProductCatalog.allPanels

    fun getPanelById(id: String): PVCPanel? = ProductCatalog.findById(id)

    /** Loads the whole catalogue into [ProductCatalog]; null on success, else why it failed. */
    suspend fun refresh(): String? = try {
        val panels = mutableListOf<PVCPanel>()
        var page = 1
        do {
            val result: ProductPage = api.get("/products?page=$page&limit=$PAGE_SIZE", authenticated = true)
            panels += result.products.filter { it.isActive }.map { it.toPanel() }
            page++
        } while (page <= result.pagination.totalPages)
        ProductCatalog.replace(panels)
        null
    } catch (error: ApiException) {
        error.message
    }

    fun fetchProducts(search: String? = null, categoryId: String? = null): Flow<Resource<List<PVCPanel>>> = flow {
        val cached = ProductCatalog.allPanels.takeIf { it.isNotEmpty() }
        emit(Resource.Loading(cached?.let { filterPanels(it, search, categoryId) }))
        when (val error = refresh()) {
            null -> emit(Resource.Success(filterPanels(ProductCatalog.allPanels, search, categoryId)))
            else -> emit(Resource.Error(error, cached?.let { filterPanels(it, search, categoryId) }))
        }
    }

    private fun filterPanels(list: List<PVCPanel>, search: String?, categoryId: String?): List<PVCPanel> {
        return list.filter { panel ->
            val matchesCategory = when {
                categoryId == null -> true
                categoryId.contains("wall", ignoreCase = true) -> panel.surfaceType == SurfaceType.WALL
                categoryId.contains("ceiling", ignoreCase = true) -> panel.surfaceType == SurfaceType.CEILING
                else -> true
            }
            val matchesSearch = search.isNullOrBlank() ||
                panel.name.contains(search, ignoreCase = true) ||
                panel.category.contains(search, ignoreCase = true) ||
                panel.description.contains(search, ignoreCase = true) ||
                panel.sku.contains(search, ignoreCase = true) ||
                (panel.material?.contains(search, ignoreCase = true) == true)
            matchesCategory && matchesSearch
        }
    }

    /**
     * Product sizes are entered in centimetres on the website (e.g. 60 × 240 × 1.2);
     * the app works in metres and shows thickness in millimetres.
     */
    private fun ApiProduct.toPanel(): PVCPanel {
        val categoryName = category?.name ?: ""
        val isCeiling = categoryName.contains("ceiling", ignoreCase = true)
        val available = inventory?.let { (it.quantity - it.reservedQty).coerceAtLeast(0) }
        val image = images.firstOrNull { it.isPrimary } ?: images.minByOrNull { it.sortOrder }
        return PVCPanel(
            id = id,
            name = name,
            category = categoryName,
            widthMeters = (width?.toDoubleOrNull() ?: 0.0) / 100.0,
            heightMeters = (height?.toDoubleOrNull() ?: 0.0) / 100.0,
            // Drawn behind a product with no photo.
            textureResource = if (isCeiling) "gloss_white" else "wood_oak",
            pricePerUnit = price?.toDoubleOrNull(),
            finish = material ?: "PVC",
            description = description.orEmpty(),
            inStock = (available ?: 0) > 0,
            sku = sku,
            imageUrl = image?.url?.let(::absoluteUrl),
            material = material,
            inventoryQty = available,
            thicknessMm = thickness?.toDoubleOrNull()?.let { (it * 10).roundToInt() } ?: 0
        )
    }

    /** Uploaded images may be stored as a path ("/uploads/..."), relative to the backend's host. */
    private fun absoluteUrl(url: String): String =
        if (url.startsWith("http://") || url.startsWith("https://")) url else api.origin + "/" + url.trimStart('/')

    @Serializable
    private data class ProductPage(val products: List<ApiProduct>, val pagination: Pagination)

    @Serializable
    private data class Pagination(val page: Int, val totalPages: Int)

    @Serializable
    private data class ApiProduct(
        val id: String,
        val name: String,
        val description: String? = null,
        val sku: String = "",
        // Prisma decimals arrive as strings ("1850", "1.2"); price is null when signed out.
        val price: String? = null,
        val width: String? = null,
        val height: String? = null,
        val thickness: String? = null,
        val material: String? = null,
        val isActive: Boolean = true,
        val category: ApiCategory? = null,
        val images: List<ApiImage> = emptyList(),
        val inventory: ApiInventory? = null
    )

    @Serializable
    private data class ApiCategory(val name: String)

    @Serializable
    private data class ApiImage(val url: String, val isPrimary: Boolean = false, val sortOrder: Int = 0)

    @Serializable
    private data class ApiInventory(val quantity: Int = 0, val reservedQty: Int = 0)

    companion object {
        private const val PAGE_SIZE = 100
    }
}
