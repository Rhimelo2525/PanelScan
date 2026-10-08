package com.example.panelscan.core.navigation

sealed class Screen(val route: String) {
    /**
     * What to pass to `navigate()`. Usually the route itself, but routes with optional
     * query arguments navigate to their bare path instead of the pattern.
     */
    open val navigationRoute: String get() = route

    data object Splash : Screen("splash")
    data object Home : Screen("home")
    data object Products : Screen("products?filter={filter}") {
        override val navigationRoute: String get() = "products"

        fun createRoute(filter: String?) =
            if (filter == null) navigationRoute else "products?filter=$filter"
    }
    data object ProductDetail : Screen("product_detail/{productId}") {
        fun createRoute(productId: String) = "product_detail/$productId"
    }

    /** Measurement briefing — the Measure tab lands here, never straight in the camera. */
    data object Measure : Screen("measure")

    /** The ARCore camera screen. Only this route creates an AR session. */
    data object ArMeasurement : Screen("ar_measurement")
    data object MeasurementResult : Screen("measurement_result")
    data object PanelSelection : Screen("panel_selection")
    data object Projects : Screen("projects")
    data object ProjectDetail : Screen("project_detail/{projectId}") {
        fun createRoute(projectId: String) = "project_detail/$projectId"
    }

    /** The SceneView screen. Only this route creates a 3D renderer. */
    data object Preview3D : Screen("preview_3d/{projectId}") {
        fun createRoute(projectId: String) = "preview_3d/$projectId"
    }
    data object Account : Screen("account")
    data object Notifications : Screen("notifications")

    data object Login : Screen("login")
    data object SignUp : Screen("sign_up")
    data object CustomerProfile : Screen("customer_profile")
    data object ForgotPassword : Screen("forgot_password")
    data object Chat : Screen("chat?conversationId={conversationId}") {
        override val navigationRoute: String get() = "chat"
        fun createRoute(conversationId: String? = null) =
            if (conversationId == null) navigationRoute else "chat?conversationId=$conversationId"
    }

    data object Cart : Screen("cart")
    data object Checkout : Screen("checkout")

    /** Map pin for the exact drop-off point; returns to checkout on confirm. */
    data object DeliveryLocationPicker : Screen("delivery_location")
    data object OrderConfirmation : Screen("order_confirmation/{orderId}") {
        fun createRoute(orderId: String) = "order_confirmation/$orderId"
    }
    data object Orders : Screen("orders")
    data object OrderDetail : Screen("order_detail/{orderId}") {
        fun createRoute(orderId: String) = "order_detail/$orderId"
    }
    data object Installation : Screen("installation?orderId={orderId}") {
        override val navigationRoute: String get() = "installation"
        fun createRoute(orderId: String? = null) =
            if (orderId == null) navigationRoute else "installation?orderId=$orderId"
    }
    data object Feedback : Screen("feedback?orderId={orderId}") {
        override val navigationRoute: String get() = "feedback"
        fun createRoute(orderId: String? = null) =
            if (orderId == null) navigationRoute else "feedback?orderId=$orderId"
    }
    data object About : Screen("about")
    data object PrivacyPolicy : Screen("privacy_policy")
    data object TermsAndConditions : Screen("terms_and_conditions")
}

/** Routes that show the bottom navigation bar. */
val BottomBarRoutes = setOf(
    Screen.Home.route,
    Screen.Products.route,
    Screen.Measure.route,
    Screen.Projects.route,
    Screen.Account.route
)
