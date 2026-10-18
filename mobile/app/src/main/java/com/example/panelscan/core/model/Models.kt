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

/**
 * How a panel's face is shaped in the 3D preview: smooth, square ridges
 * (fluted 5in1/6in1/7in1), half-round flutes (inverted circle), or a flat
 * face with lines along it (spandrel ceiling panels).
 */
@Serializable
enum class PanelProfile { FLAT, FLUTED, INVERTED_CIRCLE, SPANDREL }

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
    /** Every product photo, main one first (up to four from the admin); [imageUrl] is the first. */
    val imageUrls: List<String> = emptyList(),
    val material: String? = null,
    val inventoryQty: Int? = null,
    val imageResId: Int? = null,
    /** Panel thickness in millimetres (PVC face layer). Used in spec display only. */
    val thicknessMm: Int = 8,
    /** The shape the 3D preview gives the panel face (set per product on the website). */
    val profile: PanelProfile = PanelProfile.FLAT,
    /** Grooves across one panel (the 5 in "5in1"; lines on a spandrel); 0 when flat. */
    val grooveCount: Int = 0,
    /** A straight-on photo of the face for the 3D preview; null uses the main photo. */
    val surfaceImageUrl: String? = null
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

/**
 * The photo of the measured wall, taken as the measurement was confirmed, and
 * where the wall sat in it, so the 3D preview can show the panels on the
 * customer's own wall. Kept on the phone only.
 */
@Serializable
data class WallPhoto(
    /** JPEG in the app's private storage. */
    val fileName: String,
    val imageWidth: Int,
    val imageHeight: Int,
    /** The AR camera's projection for that image (4×4, column-major). */
    val projection: List<Float>,
    /**
     * The measured wall's corners as the camera saw them, in metres (x right,
     * y up, looking down -z): bottom-left, bottom-right, top-right, top-left.
     */
    val corners: List<Float>
)

/** A project saved to the account, as the PanelScan team sees it. */
data class ProjectReference(
    /** The project's id on the backend (notifications refer to it). */
    val backendId: String,
    /** Reference code to quote to the team, e.g. "PRJ-2026-1A2B3C4D"; staff can look the project up by it. */
    val code: String
)

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
    val bookingStatus: String = "Not booked",
    /** The backend's delivery stage ("AWAITING_QUOTE", "PICKED_UP"...); null before there is one. */
    val status: String? = null
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
/** The backend's booking statuses. */
enum class InstallationStatus(val label: String) {
    PENDING("Pending"),
    APPROVED("Approved"),
    SCHEDULED("Scheduled"),
    COMPLETED("Completed"),
    CANCELLED("Cancelled")
}

@Serializable
data class InstallationBooking(
    val id: String,
    val orderId: String? = null,
    val orderNumber: String? = null,
    /** Display date in Philippine time, e.g. "Oct 20, 2026". */
    val scheduledDate: String,
    val preferredTime: String = "Morning (9:00 AM - 12:00 PM)",
    val address: String,
    val notes: String? = null,
    val status: InstallationStatus = InstallationStatus.PENDING,
    val installerName: String? = null,
    val installerSpecialty: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

/** Feedback on a delivered order (one per order, as on the website). */
@Serializable
data class CustomerReview(
    val id: String,
    val orderId: String,
    val orderNumber: String,
    val customerName: String,
    val rating: Int,
    /** Optional on the backend. */
    val comment: String?,
    val createdAt: Long = System.currentTimeMillis()
)
