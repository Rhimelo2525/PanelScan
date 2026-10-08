package com.example.panelscan.core.model

import kotlinx.serialization.Serializable

@Serializable
data class MeasurementResult(
    val widthMeters: Double,
    val heightMeters: Double,
    val areaSquareMeters: Double,
    val surfaceType: SurfaceType
)

enum class SurfaceType {
    WALL, CEILING
}

@Serializable
data class PVCPanel(
    val id: String,
    val name: String,
    val category: String,
    val widthMeters: Double,
    val heightMeters: Double,
    val textureResource: String, // String identifier for resource or path
    val pricePerUnit: Double? = null,
    // Presentation-only catalogue detail. Defaulted so nothing that constructs a panel
    // without them (e.g. the Room fallback) has to change.
    val finish: String = "Matte",
    val description: String = "",
    val inStock: Boolean = true,
    val sku: String = "",
    val imageUrl: String? = null,
    val material: String? = null,
    val inventoryQty: Int? = null,
    val imageResId: Int? = null,
    /** Panel thickness in millimetres (PVC face layer). Used in spec display only. */
    val thicknessMm: Int = 8
) {
    val areaSquareMeters: Double get() = widthMeters * heightMeters

    /** Coverage of a single panel, which is what the estimator divides the surface by. */
    val coverageSquareMeters: Double get() = areaSquareMeters

    val surfaceType: SurfaceType
        get() = if (category.contains("Ceiling", ignoreCase = true)) SurfaceType.CEILING else SurfaceType.WALL
}

@Serializable
data class Estimation(
    val surfaceArea: Double,
    val panelArea: Double,
    val baseQuantity: Int,
    val wastePercent: Int,
    val finalQuantity: Int,
    val estimatedCost: Double?
) {
    /** Total panel face area being ordered, i.e. what the final quantity actually covers. */
    val totalMaterialArea: Double get() = finalQuantity * panelArea
}

@Serializable
data class SavedProject(
    val id: String,
    val name: String,
    val measurement: MeasurementResult,
    val selectedPanel: PVCPanel,
    val estimation: Estimation,
    val createdAt: Long
)

@Serializable
data class CartItem(
    val id: String,
    val panel: PVCPanel,
    val quantity: Int
) {
    val lineTotal: Double
        get() = (panel.pricePerUnit ?: 0.0) * quantity
}

/** The backend's order statuses (same as the website's order tabs). */
@Serializable
enum class OrderStatus(val label: String) {
    PENDING("Pending"),
    PROCESSING("Processing"),
    SHIPPED("Shipped"),
    DELIVERED("Delivered"),
    CANCELLED("Cancelled")
}

/**
 * Where an order stands in the order -> shipping quote -> payment workflow, as
 * on the website (web/src/orders/order-workflow.ts). The backend enforces every
 * step; this only decides what the customer sees and can do.
 */
enum class OrderStage(val label: String) {
    AWAITING_APPROVAL("Awaiting Approval"),
    AWAITING_QUOTE("Awaiting Shipping Fee"),
    AWAITING_PAYMENT("Awaiting Payment"),
    PAID("Paid"),
    CANCELLED("Cancelled")
}

/** The customer's GCash payment for an order (null on the order until one is started). */
enum class PaymentStatus { PENDING, PAID, FAILED, REFUNDED }

@Serializable
data class OrderItem(
    val id: String,
    val panelId: String,
    val panelName: String,
    val finish: String,
    val unitPrice: Double,
    val quantity: Int,
    val lineTotal: Double,
    val textureResource: String,
    val imageResId: Int? = null,
    /** The product's photo from the backend. */
    val imageUrl: String? = null
)

/**
 * Delivery and payment facts captured at checkout. Every status is what the providers
 * actually reported; "not quoted" and "pending" are real states, not placeholders.
 */
@Serializable
data class OrderDeliveryDetails(
    val latitude: Double? = null,
    val longitude: Double? = null,
    val vehicle: String? = null,
    val provider: String? = null,
    /** True only when the fee came from a provider quote. */
    val feeQuoted: Boolean = false,
    val quoteStatus: String = "Not quoted",
    val paymentStatus: String = "Pending",
    val bookingReference: String? = null,
    val bookingStatus: String = "Not booked"
)

@Serializable
data class Order(
    val id: String,
    val orderNumber: String,
    val items: List<OrderItem>,
    val subtotal: Double,
    val shippingFee: Double,
    val installationFee: Double,
    val totalAmount: Double,
    val hasInstallation: Boolean,
    val shippingAddress: String,
    val customerName: String,
    val customerEmail: String,
    val customerPhone: String? = null,
    val paymentMethod: String,
    val status: OrderStatus,
    val notes: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val delivery: OrderDeliveryDetails = OrderDeliveryDetails(),
    /** A moderator approved the order; the shipping fee is quoted after that. */
    val moderatorApproved: Boolean = false,
    /** The shipping fee has been quoted, so products + shipping can be paid. */
    val shippingQuoted: Boolean = false,
    /** The order's GCash payment, once looked up (see OrderRepository.findPayment). */
    val paymentStatus: PaymentStatus? = null,
    /** Preferred installation date (ISO-8601), when installation was requested. */
    val installationDate: String? = null
) {
    val stage: OrderStage
        get() = when {
            paymentStatus == PaymentStatus.PAID || paymentStatus == PaymentStatus.REFUNDED -> OrderStage.PAID
            status == OrderStatus.CANCELLED -> OrderStage.CANCELLED
            !moderatorApproved -> OrderStage.AWAITING_APPROVAL
            !shippingQuoted -> OrderStage.AWAITING_QUOTE
            else -> OrderStage.AWAITING_PAYMENT
        }

    /** Only a pending order can be cancelled by the customer (backend rule). */
    val canCancel: Boolean get() = status == OrderStatus.PENDING
}

@Serializable
enum class InstallationStatus(val label: String) {
    PENDING("Pending"),
    CONFIRMED("Confirmed"),
    ASSIGNED("Installer Assigned"),
    COMPLETED("Completed"),
    CANCELLED("Cancelled")
}

@Serializable
data class InstallationBooking(
    val id: String,
    val orderId: String? = null,
    val orderNumber: String? = null,
    val scheduledDate: String,
    val preferredTime: String = "Morning (9:00 AM - 12:00 PM)",
    val address: String,
    val notes: String? = null,
    val status: InstallationStatus = InstallationStatus.PENDING,
    val installerName: String? = null,
    val installerSpecialty: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

@Serializable
data class CustomerReview(
    val id: String,
    val orderId: String,
    val orderNumber: String,
    val panelId: String,
    val customerName: String,
    val rating: Int,
    val comment: String,
    val createdAt: Long = System.currentTimeMillis()
)
