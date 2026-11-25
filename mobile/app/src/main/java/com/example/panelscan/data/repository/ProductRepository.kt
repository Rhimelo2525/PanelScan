package com.example.panelscan.data.repository

import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.logic.PanelShape
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
    suspend fun refresh(): String? {
        return try {
            val panels = fetchAllPages(authenticated = true)
            ProductCatalog.replace(panels)
            null
        } catch (error: ApiException) {
            // If an authenticated fetch failed due to an auth/session issue, retry once as a
            // public request so the product catalogue still loads.
            if (!error.isNetworkError) {
                runCatching { fetchAllPages(authenticated = false) }.getOrNull()?.let { panels ->
                    ProductCatalog.replace(panels)
                    return null
                }
            }
            ProductCatalog.recordError(error.message)
            error.message
        } catch (error: Exception) {
            val msg = error.message ?: ApiClient.NETWORK_ERROR_MESSAGE
            ProductCatalog.recordError(msg)
            msg
        }
    }

    private suspend fun fetchAllPages(authenticated: Boolean): List<PVCPanel> {
        val panels = mutableListOf<PVCPanel>()
        var page = 1
        do {
            val result: ProductPage = api.get("/products?page=$page&limit=$PAGE_SIZE", authenticated = authenticated)
            panels += result.products.filter { it.isActive }.map { it.toPanel() }
            page++
        } while (page <= result.pagination.totalPages)
        return panels
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
        val (shape, grooves) = PanelShape.resolve(panelProfile, grooveCount, name)
        val isCeiling = categoryName.contains("ceiling", ignoreCase = true) ||
            categoryName.contains("spandrel", ignoreCase = true) ||
            name.contains("ceiling", ignoreCase = true) ||
            name.contains("spandrel", ignoreCase = true) ||
            shape == com.example.panelscan.core.model.PanelProfile.SPANDREL
        // On hand minus reserved, as the cart and checkout check it; no inventory record means none.
        val available = inventory?.let { (it.quantity - it.reservedQty).coerceAtLeast(0) } ?: 0
        // Main photo first, then the rest in their order, as the website's gallery shows them.
        val photos = images.sortedWith(compareByDescending<ApiImage> { it.isPrimary }.thenBy { it.sortOrder })
            .map { absoluteUrl(it.url) }
        val widthCm = width?.trim()?.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0.0 }
            ?: if (isCeiling) 25.0 else 20.0
        val heightCm = height?.trim()?.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0.0 }
            ?: 290.0
        return PVCPanel(
            id = id,
            name = name,
            category = categoryName.ifBlank { if (isCeiling) "Ceiling Panels" else "Wall Panels" },
            widthMeters = widthCm / 100.0,
            heightMeters = heightCm / 100.0,
            // Drawn behind a product with no photo.
            textureResource = if (isCeiling) "gloss_white" else "wood_oak",
            pricePerUnit = price?.toDoubleOrNull(),
            finish = material ?: "PVC",
            description = description.orEmpty(),
            inStock = available > 0,
            sku = sku,
            imageUrl = photos.firstOrNull(),
            imageUrls = photos,
            material = material,
            inventoryQty = available,
            thicknessMm = thickness?.toDoubleOrNull()?.let { (it * 10).roundToInt() } ?: 0,
            profile = shape,
            grooveCount = grooves,
            surfaceImageUrl = surfaceImageUrl?.let(::absoluteUrl)
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
        val inventory: ApiInventory? = null,
        val panelProfile: String? = null,
        val grooveCount: Int? = null,
        val surfaceImageUrl: String? = null
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
