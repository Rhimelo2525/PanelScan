package com.example.panelscan.core.payment

/**
 * GCash payment domain.
 *
 * GCash is the only payment method. The app talks to a [GCashPaymentProvider]; a real
 * implementation calls PanelScan's backend, which holds the merchant credentials for the
 * GCash integration (GCash direct or an aggregator) and returns a hosted checkout URL.
 * Merchant secrets must never ship in the APK, so the app is only configured with the
 * backend base URL ([PaymentConfig]).
 *
 * A payment is PAID only when the provider reports it paid. Tapping "Pay with GCash" moves
 * the state to PROCESSING at most — never to PAID.
 */
enum class PaymentState(val label: String) {
    PENDING("Pending"),
    PROCESSING("Processing"),
    PAID("Paid"),
    FAILED("Failed"),
    CANCELLED("Cancelled");

    val isFinal: Boolean get() = this == PAID || this == CANCELLED
}

data class GCashPaymentRequest(
    /** PanelScan-side reference so the backend can reconcile the webhook. */
    val reference: String,
    val amount: Double,
    val currency: String = "PHP",
    val description: String,
    /** E.164, e.g. +639171234567. */
    val customerPhone: String
)

data class GCashPaymentSession(
    val paymentId: String,
    /** Hosted GCash authorisation page the customer completes the payment on. */
    val checkoutUrl: String?,
    val state: PaymentState
)

enum class PaymentFailure { NOT_CONFIGURED, DECLINED, NETWORK }

sealed interface PaymentResult<out T> {
    data class Success<T>(val data: T) : PaymentResult<T>
    data class Failure(val reason: PaymentFailure, val message: String) : PaymentResult<Nothing>
}

interface GCashPaymentProvider {
    val isConfigured: Boolean
    suspend fun createPayment(request: GCashPaymentRequest): PaymentResult<GCashPaymentSession>

    /** Authoritative status from the provider (backed by its webhook on the server). */
    suspend fun fetchStatus(paymentId: String): PaymentResult<PaymentState>
    suspend fun cancel(paymentId: String): PaymentResult<PaymentState>
}

/** Answers honestly that GCash is not connected yet. Nothing is ever marked paid. */
class UnconfiguredGCashPaymentProvider : GCashPaymentProvider {
    override val isConfigured: Boolean = false

    private fun <T> notConfigured(): PaymentResult<T> = PaymentResult.Failure(
        PaymentFailure.NOT_CONFIGURED,
        "GCash payments aren't connected yet. No money has been taken — our team will send you a GCash payment request."
    )

    override suspend fun createPayment(request: GCashPaymentRequest): PaymentResult<GCashPaymentSession> = notConfigured()
    override suspend fun fetchStatus(paymentId: String): PaymentResult<PaymentState> = notConfigured()
    override suspend fun cancel(paymentId: String): PaymentResult<PaymentState> = notConfigured()
}

data class PaymentConfig(val backendBaseUrl: String) {
    val isComplete: Boolean get() = backendBaseUrl.isNotBlank()
}

object GCashPaymentProviders {
    /** No HTTP implementation is bundled until the payment backend endpoint exists. */
    fun create(config: PaymentConfig, provider: GCashPaymentProvider? = null): GCashPaymentProvider =
        if (config.isComplete && provider != null) provider else UnconfiguredGCashPaymentProvider()
}

/** Full payment state for checkout, including why it is where it is. */
data class PaymentUiState(
    val state: PaymentState = PaymentState.PENDING,
    val paymentId: String? = null,
    val checkoutUrl: String? = null,
    val message: String? = null
)

/**
 * The only way payment state changes. Pure, so every transition is unit tested.
 */
object PaymentStateMachine {

    /** Customer tapped "Pay with GCash". Waiting on the provider — not paid. */
    fun onPayRequested(current: PaymentUiState): PaymentUiState = when (current.state) {
        PaymentState.PAID, PaymentState.PROCESSING -> current
        else -> current.copy(state = PaymentState.PROCESSING, message = null)
    }

    fun onSessionResult(current: PaymentUiState, result: PaymentResult<GCashPaymentSession>): PaymentUiState = when (result) {
        is PaymentResult.Success -> current.copy(
            // A freshly created session is at most PROCESSING, whatever it claims, until
            // the status endpoint confirms otherwise.
            state = if (result.data.state == PaymentState.PAID) PaymentState.PROCESSING else result.data.state,
            paymentId = result.data.paymentId,
            checkoutUrl = result.data.checkoutUrl,
            message = "Complete the payment in GCash, then return to PanelScan."
        )
        is PaymentResult.Failure -> current.copy(
            state = if (result.reason == PaymentFailure.NOT_CONFIGURED) PaymentState.PENDING else PaymentState.FAILED,
            message = result.message
        )
    }

    /** Provider-confirmed status is the only route to PAID. */
    fun onStatusResult(current: PaymentUiState, result: PaymentResult<PaymentState>): PaymentUiState = when (result) {
        is PaymentResult.Success -> current.copy(
            state = result.data,
            message = when (result.data) {
                PaymentState.PAID -> "Delivery fee paid."
                PaymentState.FAILED -> "The GCash payment didn't go through. You can try again."
                PaymentState.CANCELLED -> "The GCash payment was cancelled."
                PaymentState.PROCESSING -> "Waiting for GCash to confirm the payment."
                PaymentState.PENDING -> current.message
            }
        )
        is PaymentResult.Failure -> current.copy(message = result.message)
    }

    /** A new quote means a new amount; any unpaid session no longer applies. */
    fun onAmountChanged(current: PaymentUiState): PaymentUiState =
        if (current.state == PaymentState.PAID) current else PaymentUiState()
}
