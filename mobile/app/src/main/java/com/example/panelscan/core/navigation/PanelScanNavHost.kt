package com.example.panelscan.core.navigation

import kotlinx.coroutines.launch
import androidx.compose.runtime.DisposableEffect
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalUriHandler
import com.example.panelscan.feature.address.AddressFormViewModel
import com.example.panelscan.feature.address.AddressFormScreen
import com.example.panelscan.data.repository.AddressRepository
import androidx.compose.runtime.rememberCoroutineScope
import android.widget.Toast
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.panelscan.core.data.ProductCatalog
import com.example.panelscan.core.design.LocalReducedMotion
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.PanelScanMotion
import com.example.panelscan.core.model.MeasurementResult
import com.example.panelscan.core.model.SavedProject
import com.example.panelscan.core.model.SurfaceType
import com.example.panelscan.core.model.OrderStatus
import com.example.panelscan.core.model.InstallationStatus
import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.core.ui.LoadingState
import com.example.panelscan.core.ui.PanelScanBottomNav
import com.example.panelscan.core.ui.PriceVisibility
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.data.local.ProjectDatabase
import com.example.panelscan.data.local.SharedPreferencesNotificationStore
import com.example.panelscan.data.local.NotificationDestination
import com.example.panelscan.data.repository.AuthRepository
import com.example.panelscan.data.repository.CartRepository
import com.example.panelscan.data.repository.ChatRepository
import com.example.panelscan.data.repository.FeedbackRepository
import com.example.panelscan.data.repository.InstallationRepository
import com.example.panelscan.data.repository.OrderRepository
import com.example.panelscan.data.repository.NotificationRepository
import com.example.panelscan.data.repository.ProductRepository
import com.example.panelscan.data.repository.ProjectRepository
import com.example.panelscan.feature.about.AboutScreen
import com.example.panelscan.feature.account.AccountScreen
import com.example.panelscan.feature.account.CustomerProfileScreen
import com.example.panelscan.feature.auth.AuthViewModel
import com.example.panelscan.feature.auth.ForgotPasswordScreen
import com.example.panelscan.feature.auth.LoginScreen
import com.example.panelscan.feature.auth.SignUpScreen
import com.example.panelscan.feature.legal.PrivacyPolicyScreen
import com.example.panelscan.feature.legal.TermsAndConditionsScreen
import com.example.panelscan.feature.cart.CartScreen
import com.example.panelscan.feature.cart.CartViewModel
import com.example.panelscan.feature.chat.ChatScreen
import com.example.panelscan.feature.chat.ChatViewModel
import com.example.panelscan.feature.checkout.CheckoutScreen
import com.example.panelscan.feature.checkout.CheckoutViewModel
import com.example.panelscan.feature.checkout.DeliveryLocationPickerScreen
import com.example.panelscan.core.config.IntegrationConfig
import com.example.panelscan.feature.checkout.OrderConfirmationScreen
import com.example.panelscan.feature.feedback.FeedbackScreen
import com.example.panelscan.feature.feedback.FeedbackViewModel
import com.example.panelscan.feature.home.HomeScreen
import com.example.panelscan.feature.installation.InstallationScreen
import com.example.panelscan.feature.installation.InstallationViewModel
import com.example.panelscan.feature.measurement.ARMeasurementScreen
import com.example.panelscan.feature.measurement.MeasureEntryScreen
import com.example.panelscan.feature.measurement.MeasurementResultScreen
import com.example.panelscan.feature.measurement.MeasurementViewModel
import com.example.panelscan.feature.measurement.PanelSelectionScreen
import com.example.panelscan.feature.orders.OrderDetailScreen
import com.example.panelscan.feature.orders.OrdersScreen
import com.example.panelscan.feature.notifications.NotificationsScreen
import com.example.panelscan.feature.preview3d.Preview3DScreen
import com.example.panelscan.feature.products.CatalogFilter
import com.example.panelscan.feature.products.ProductDetailScreen
import com.example.panelscan.feature.products.ProductsScreen
import com.example.panelscan.feature.projects.ProjectDetailScreen
import com.example.panelscan.feature.projects.ProjectsScreen
import com.example.panelscan.feature.projects.ProjectsViewModel

@Composable
fun PanelScanNavHost(
    navController: NavHostController = rememberNavController()
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val reducedMotion = LocalReducedMotion.current

    // The customer session and the PanelScan backend client; repositories not yet
    // connected to the backend still keep their state on the device.
    val sessionManager = remember(context) { SessionManager(context) }
    val apiClient = remember(sessionManager) { ApiClient(IntegrationConfig.apiBaseUrl, sessionManager) }
    val authRepository = remember(sessionManager, apiClient) { AuthRepository(sessionManager, apiClient) }
    val productRepository = remember(apiClient) { ProductRepository(apiClient) }
    val chatRepository = remember(sessionManager, apiClient) { ChatRepository(sessionManager, apiClient) }
    // Lives as long as the app's navigation, so a cart change still reaches the backend after leaving a screen.
    val appScope = rememberCoroutineScope()
    val cartRepository = remember(apiClient) { CartRepository(apiClient, sessionManager, appScope) }
    val notificationRepository = remember(context) {
        NotificationRepository(SharedPreferencesNotificationStore(context)).apply {
            openCustomer((sessionManager.sessionState.value as? CustomerSessionState.LoggedIn)?.user?.email)
        }
    }
    val addressRepository = remember(apiClient) { AddressRepository(apiClient) }
    val orderRepository = remember(notificationRepository, apiClient) {
        OrderRepository(
            api = apiClient,
            onCreated = { order ->
                notificationRepository.publish(
                    "Order placed", "Order #${order.orderNumber} is waiting for approval.",
                    NotificationDestination.ORDER, order.id
                )
            },
            onStatusChanged = { order ->
                val title = when (order.status) {
                    OrderStatus.PROCESSING -> "Order processing"
                    OrderStatus.SHIPPED -> "Order shipped"
                    OrderStatus.DELIVERED -> "Order delivered"
                    OrderStatus.CANCELLED -> "Order cancelled"
                    OrderStatus.PENDING -> "Order status changed"
                }
                notificationRepository.publish(
                    title, "Order #${order.orderNumber}: ${order.status.label}.",
                    NotificationDestination.ORDER, order.id
                )
            }
        )
    }
    val installationRepository = remember(notificationRepository) {
        InstallationRepository { booking ->
            notificationRepository.publish(
                "Installation request update", "Your installation request is ${booking.status.label.lowercase()}.",
                NotificationDestination.INSTALLATION, booking.orderId
            )
        }
    }
    val feedbackRepository = remember(orderRepository) { FeedbackRepository(orderRepository) }

    val authViewModel: AuthViewModel = viewModel(factory = authViewModelFactory(authRepository))
    val chatViewModel: ChatViewModel = viewModel(factory = chatViewModelFactory(chatRepository, sessionManager))
    val cartViewModel: CartViewModel = viewModel(factory = cartViewModelFactory(cartRepository))
    val checkoutViewModel: CheckoutViewModel = viewModel(
        factory = checkoutViewModelFactory(cartRepository, orderRepository, addressRepository)
    )
    val addressFormViewModel: AddressFormViewModel = viewModel(factory = addressFormViewModelFactory(addressRepository, sessionManager))
    val installationViewModel: InstallationViewModel = viewModel(
        factory = installationViewModelFactory(installationRepository, orderRepository, sessionManager)
    )
    val feedbackViewModel: FeedbackViewModel = viewModel(
        factory = feedbackViewModelFactory(feedbackRepository, orderRepository, sessionManager)
    )

    val sessionState by sessionManager.sessionState.collectAsState()
    LaunchedEffect(sessionState) {
        notificationRepository.openCustomer((sessionState as? CustomerSessionState.LoggedIn)?.user?.email)
    }
    val notifications by notificationRepository.notifications.collectAsState()
    val pricesVisible = PriceVisibility.isPriceVisible(sessionState)

    // The catalogue comes from the backend; prices are included only when signed in,
    // so it is (re)loaded at start and whenever the customer logs in or out.
    val isSignedIn = sessionState is CustomerSessionState.LoggedIn
    LaunchedEffect(isSignedIn) {
        productRepository.refresh()
        // Signed in: the account's cart (anything added while signed out moves into it).
        if (isSignedIn) {
            cartRepository.onSignedIn()
            orderRepository.refresh()
        } else {
            cartRepository.onSignedOut()
            orderRepository.onSignedOut()
            addressRepository.onSignedOut()
        }
    }
    // e.g. "Only 3 items are available." when the backend refuses a cart change.
    LaunchedEffect(cartRepository) {
        cartRepository.messages.collect { message -> Toast.makeText(context, message, Toast.LENGTH_LONG).show() }
    }

    val repository = remember(context) {
        ProjectRepository(
            ProjectDatabase.getDatabase(context).projectDao(),
            ProductCatalog.panels
        )
    }
    val projectsViewModel: ProjectsViewModel = viewModel(
        factory = projectsViewModelFactory(repository) { project ->
            notificationRepository.publish(
                "Project saved", "${project.name} is available in your projects.",
                NotificationDestination.PROJECT, project.id
            )
        }
    )
    val measurementViewModel: MeasurementViewModel = viewModel()

    val projects by projectsViewModel.projects.collectAsState()
    val measurementState by measurementViewModel.uiState.collectAsState()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = currentRoute in BottomBarRoutes

    var bottomBarHeight by remember { mutableStateOf(0.dp) }
    val contentBottomPadding: Dp = if (showBottomBar) bottomBarHeight else 0.dp

    val appVersion = remember(context) {
        runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName
        }.getOrNull() ?: "1.0"
    }

    val enterDuration = if (reducedMotion) 0 else PanelScanMotion.Normal

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PanelScan.colors.pageBackground)
    ) {
        NavHost(
            navController = navController,
            startDestination = Screen.Splash.route,
            modifier = Modifier.fillMaxSize(),
            enterTransition = {
                fadeIn(tween(enterDuration)) +
                    slideInHorizontally(tween(enterDuration)) { it / 12 }
            },
            exitTransition = { fadeOut(tween(enterDuration)) },
            popEnterTransition = { fadeIn(tween(enterDuration)) },
            popExitTransition = {
                fadeOut(tween(enterDuration)) +
                    slideOutHorizontally(tween(enterDuration)) { it / 12 }
            }
        ) {
            composable(Screen.Splash.route) {
                com.example.panelscan.feature.splash.SplashScreen(
                    onFinished = {
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Splash.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Home.route) {
                HomeScreen(
                    recentProjects = projects.take(6),
                    onStartMeasurement = { navController.navigateToTab(Screen.Measure) },
                    onOpenCategory = { surfaceType ->
                        navController.navigate(
                            Screen.Products.createRoute(surfaceType.name)
                        ) { launchSingleTop = true }
                    },
                    onOpenProject = { project ->
                        navController.navigate(Screen.ProjectDetail.createRoute(project.id))
                    },
                    onOpenAccount = { navController.navigateToTab(Screen.Account) },
                    onSeeAllProjects = { navController.navigateToTab(Screen.Projects) },
                    onOpenCart = { navController.navigate(Screen.Cart.route) },
                    onOpenInstallation = { navController.navigate(Screen.Installation.navigationRoute) },
                    onOpenOrders = { navController.navigate(Screen.Orders.route) },
                    onOpenChat = { navController.navigate(Screen.Chat.navigationRoute) },
                    onOpenFeedback = { navController.navigate(Screen.Feedback.navigationRoute) },
                    onOpenAbout = { navController.navigate(Screen.About.route) },
                    onOpenNotifications = { navController.navigate(Screen.Notifications.route) },
                    unreadNotifications = notifications.count { !it.read },
                    bottomPadding = contentBottomPadding
                )
            }

            composable(Screen.Notifications.route) {
                NotificationsScreen(
                    repository = notificationRepository,
                    onBack = { navController.popBackStack() },
                    onOpen = { notification ->
                        val target = when (notification.destination) {
                            NotificationDestination.ORDER -> notification.referenceId
                                ?.takeIf { orderRepository.getOrderById(it) != null }
                                ?.let(Screen.OrderDetail::createRoute) ?: Screen.Orders.route
                            NotificationDestination.ORDERS -> Screen.Orders.route
                            NotificationDestination.PROJECT -> notification.referenceId
                                ?.let(Screen.ProjectDetail::createRoute) ?: Screen.Projects.route
                            NotificationDestination.PROJECTS -> Screen.Projects.route
                            NotificationDestination.CHAT -> Screen.Chat.createRoute(notification.referenceId)
                            NotificationDestination.INSTALLATION -> Screen.Installation.createRoute(notification.referenceId)
                            NotificationDestination.NONE -> null
                        }
                        if (target != null) navController.navigate(target)
                    }
                )
            }

            composable(
                route = Screen.Products.route,
                arguments = listOf(
                    navArgument("filter") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    }
                )
            ) { entry ->
                ProductsScreen(
                    productRepository = productRepository,
                    sessionState = sessionState,
                    onOpenProduct = { panel ->
                        navController.navigate(Screen.ProductDetail.createRoute(panel.id))
                    },
                    initialFilter = when (entry.arguments?.getString("filter")) {
                        SurfaceType.WALL.name -> CatalogFilter.Wall
                        SurfaceType.CEILING.name -> CatalogFilter.Ceiling
                        else -> CatalogFilter.All
                    },
                    onOpenCart = { navController.navigate(Screen.Cart.route) },
                    bottomPadding = contentBottomPadding
                )
            }

            composable(Screen.ProductDetail.route) { entry ->
                val productId = entry.arguments?.getString("productId").orEmpty()
                val productReviews by feedbackRepository.reviews.collectAsState()
                // Follows the live catalogue, so a reload (e.g. prices after logging in) shows here too.
                val catalogue by productRepository.panels.collectAsState()
                val resolvedPanel = remember(productId, catalogue) { productRepository.getPanelById(productId) }
                if (resolvedPanel == null) {
                    ProjectLoadingScreen()
                } else {
                    ProductDetailScreen(
                        panel = resolvedPanel,
                        onBack = { navController.popBackStack() },
                        showPrice = pricesVisible,
                        onNavigateToSignIn = { navController.navigate(Screen.Login.route) },
                        onAddToCart = { selected, qty ->
                            cartRepository.addToCart(selected, qty)
                        },
                        onProceedToCheckout = { selected, qty ->
                            checkoutViewModel.beginDirectCheckout(selected, qty)
                            navController.navigate(Screen.Checkout.route)
                        },
                        reviews = productReviews.filter { it.panelId == resolvedPanel.id },
                        onOpenCart = { navController.navigate(Screen.Cart.route) },
                        onUseInMeasurement = { selected ->
                            measurementViewModel.setPreselectedPanel(selected.id)
                            measurementViewModel.setSurfaceType(selected.surfaceType)
                            navController.navigateToTab(Screen.Measure)
                        }
                    )
                }
            }

            composable(Screen.Measure.route) {
                MeasureEntryScreen(
                    viewModel = measurementViewModel,
                    onStartAr = { navController.navigate(Screen.ArMeasurement.route) },
                    onEnterManually = {
                        navController.navigate(Screen.MeasurementResult.route)
                    },
                    bottomPadding = contentBottomPadding
                )
            }

            composable(Screen.ArMeasurement.route) {
                ARMeasurementScreen(
                    viewModel = measurementViewModel,
                    onClose = { navController.popBackStack() },
                    onConfirm = {
                        measurementViewModel.clearConfirmation()
                        navController.navigate(Screen.MeasurementResult.route) {
                            popUpTo(Screen.ArMeasurement.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.MeasurementResult.route) {
                MeasurementResultScreen(
                    measurement = MeasurementResult(
                        widthMeters = measurementState.widthMeters,
                        heightMeters = measurementState.heightMeters,
                        areaSquareMeters = measurementState.areaSquareMeters,
                        surfaceType = measurementState.surfaceType
                    ),
                    source = measurementState.source,
                    preselectedPanelId = measurementState.preselectedPanelId,
                    wastePercent = measurementState.wastePercent,
                    onWasteChange = measurementViewModel::setWastePercent,
                    onPanelChosen = { measurementViewModel.setPreselectedPanel(it) },
                    showPrice = pricesVisible,
                    onBack = { navController.popBackStack() },
                    onDimensionsChanged = measurementViewModel::applyManualDimensions,
                    // AR → Estimation Result → 3D Preview → Cart
                    onViewPreview = { project ->
                        projectsViewModel.saveProject(project)
                        navController.navigate(Screen.Preview3D.createRoute(project.id))
                    },
                    onBrowsePanels = { navController.navigate(Screen.PanelSelection.route) }
                )
            }

            composable(Screen.PanelSelection.route) {
                PanelSelectionScreen(
                    measurement = measurementViewModel.getResult(),
                    preselectedPanelId = measurementState.preselectedPanelId,
                    wastePercent = measurementState.wastePercent,
                    onBack = { navController.popBackStack() },
                    showPrice = pricesVisible,
                    onProjectSaved = { project ->
                        projectsViewModel.saveProject(project)
                        measurementViewModel.setPreselectedPanel(null)
                        navController.navigate(Screen.Preview3D.createRoute(project.id))
                    }
                )
            }

            composable(Screen.Projects.route) {
                ProjectsScreen(
                    projects = projects,
                    onOpenProject = { project ->
                        navController.navigate(Screen.ProjectDetail.createRoute(project.id))
                    },
                    onStartMeasurement = { navController.navigateToTab(Screen.Measure) },
                    bottomPadding = contentBottomPadding
                )
            }

            composable(Screen.ProjectDetail.route) { entry ->
                val projectId = entry.arguments?.getString("projectId")
                val project = rememberProject(projectId, projects, repository)
                if (project == null) {
                    ProjectLoadingScreen()
                } else {
                    ProjectDetailScreen(
                        project = project,
                        onBack = { navController.popBackStack() },
                        showPrice = pricesVisible,
                        onOpen3DPreview = {
                            navController.navigate(Screen.Preview3D.createRoute(project.id))
                        },
                        onDelete = {
                            projectsViewModel.deleteProject(project)
                            navController.popBackStack()
                        }
                    )
                }
            }

            composable(Screen.Preview3D.route) { entry ->
                val projectId = entry.arguments?.getString("projectId")
                val project = rememberProject(projectId, projects, repository)
                if (project == null) {
                    ProjectLoadingScreen()
                } else {
                    Preview3DScreen(
                        project = project,
                        onBack = { navController.popBackStack() },
                        onSaveProject = { updated ->
                            projectsViewModel.saveProject(updated)
                        },
                        onAddToCart = { panel, qty ->
                            cartRepository.addToCart(panel, qty)
                            navController.navigate(Screen.Cart.route)
                        },
                        showPrice = pricesVisible
                    )
                }
            }

            composable(Screen.Account.route) {
                AccountScreen(
                    sessionState = sessionState,
                    onNavigateToSignIn = { navController.navigate(Screen.Login.route) },
                    onNavigateToSignUp = { navController.navigate(Screen.SignUp.route) },
                    onNavigateToChat = { navController.navigate(Screen.Chat.navigationRoute) },
                    onLogout = { authViewModel.logout {} },
                    projectCount = projects.size,
                    appVersion = appVersion,
                    onNavigateToProjects = { navController.navigate(Screen.Projects.route) },
                    onNavigateToOrders = { navController.navigate(Screen.Orders.route) },
                    onNavigateToInstallation = { navController.navigate(Screen.Installation.navigationRoute) },
                    onNavigateToFeedback = { navController.navigate(Screen.Feedback.navigationRoute) },
                    onNavigateToAbout = { navController.navigate(Screen.About.route) },
                    onNavigateToPrivacyPolicy = { navController.navigate(Screen.PrivacyPolicy.route) },
                    onNavigateToTerms = { navController.navigate(Screen.TermsAndConditions.route) },
                    onNavigateToCustomerProfile = { navController.navigate(Screen.CustomerProfile.route) },
                    authRepository = authRepository,
                    bottomPadding = contentBottomPadding
                )
            }

            // Customer Authentication Destinations
            composable(Screen.Login.route) {
                LoginScreen(
                    viewModel = authViewModel,
                    onBack = { navController.popBackStack() },
                    onNavigateToSignUp = {
                        navController.navigate(Screen.SignUp.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    },
                    onNavigateToForgotPassword = {
                        navController.navigate(Screen.ForgotPassword.route)
                    },
                    onLoginSuccess = { navController.popBackStack() }
                )
            }

            composable(Screen.SignUp.route) {
                SignUpScreen(
                    viewModel = authViewModel,
                    onBack = { navController.popBackStack() },
                    onNavigateToLogin = {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.SignUp.route) { inclusive = true }
                        }
                    },
                    onRegisterSuccess = {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.SignUp.route) { inclusive = true }
                        }
                    },
                    onNavigateToTerms = { navController.navigate(Screen.TermsAndConditions.route) },
                    onNavigateToPrivacyPolicy = { navController.navigate(Screen.PrivacyPolicy.route) }
                )
            }

            composable(Screen.CustomerProfile.route) {
                val current = sessionState
                if (current is CustomerSessionState.LoggedIn) {
                    CustomerProfileScreen(
                        currentUser = current.user,
                        authRepository = authRepository,
                        onBack = { navController.popBackStack() }
                    )
                } else {
                    LaunchedEffect(Unit) {
                        navController.popBackStack()
                    }
                }
            }

            composable(Screen.ForgotPassword.route) {
                ForgotPasswordScreen(
                    authRepository = authRepository,
                    onBack = { navController.popBackStack() },
                    onNavigateToLogin = {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.ForgotPassword.route) { inclusive = true }
                        }
                    }
                )
            }

            // Customer Support Chat Destination
            composable(
                route = Screen.Chat.route,
                arguments = listOf(
                    navArgument("conversationId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    }
                )
            ) { entry ->
                val convId = entry.arguments?.getString("conversationId")
                LaunchedEffect(convId) {
                    if (!convId.isNullOrBlank()) {
                        chatViewModel.selectConversation(convId)
                    } else {
                        chatViewModel.loadConversations(autoSelectFirst = true)
                    }
                }
                ChatScreen(
                    viewModel = chatViewModel,
                    onBack = { navController.popBackStack() },
                    onNavigateToSignIn = { navController.navigate(Screen.Login.route) },
                    bottomPadding = contentBottomPadding
                )
            }

            // Customer Shopping Bag / Cart
            composable(Screen.Cart.route) {
                CartScreen(
                    viewModel = cartViewModel,
                    onBack = { navController.popBackStack() },
                    onProceedToCheckout = {
                        if (pricesVisible) {
                            checkoutViewModel.clearDirectCheckout()
                            navController.navigate(Screen.Checkout.route)
                        } else {
                            navController.navigate(Screen.Login.route)
                        }
                    },
                    onBrowseCatalog = { navController.navigateToTab(Screen.Products) },
                    showPrice = pricesVisible,
                    bottomPadding = contentBottomPadding
                )
            }

            // Customer Checkout
            composable(Screen.Checkout.route) {
                if (!pricesVisible) {
                    LaunchedEffect(Unit) {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(Screen.Checkout.route) { inclusive = true }
                        }
                    }
                } else {
                    CheckoutScreen(
                        viewModel = checkoutViewModel,
                        onBack = { navController.popBackStack() },
                        onAddAddress = {
                            addressFormViewModel.start()
                            navController.navigate(Screen.AddAddress.route)
                        },
                        onOrderPlaced = { order ->
                            navController.navigate(Screen.OrderConfirmation.createRoute(order.id)) {
                                popUpTo(Screen.Checkout.route) { inclusive = true }
                            }
                        },
                        bottomPadding = contentBottomPadding
                    )
                }
            }

            // New saved delivery address (from checkout), pinned on the map first.
            composable(Screen.AddAddress.route) {
                AddressFormScreen(
                    viewModel = addressFormViewModel,
                    onPickLocation = { navController.navigate(Screen.DeliveryLocationPicker.route) },
                    onSaved = { saved ->
                        checkoutViewModel.selectAddress(saved.id)
                        navController.popBackStack()
                    },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.DeliveryLocationPicker.route) {
                val form by addressFormViewModel.state.collectAsState()
                DeliveryLocationPickerScreen(
                    initial = form.pin,
                    addressHint = listOfNotNull(form.barangay?.name, form.city?.name, form.province?.name)
                        .joinToString(", ")
                        .let { if (it.isBlank()) "" else "$it, Philippines" },
                    onConfirm = { location ->
                        addressFormViewModel.onPinConfirmed(location)
                        navController.popBackStack()
                    },
                    onBack = { navController.popBackStack() }
                )
            }

            // Customer Order Confirmation
            composable(Screen.OrderConfirmation.route) { entry ->
                val orderId = entry.arguments?.getString("orderId").orEmpty()
                val order = orderRepository.getOrderById(orderId)
                if (!pricesVisible) {
                    LaunchedEffect(Unit) { navController.navigate(Screen.Login.route) }
                } else if (order != null) {
                    OrderConfirmationScreen(
                        order = order,
                        onViewOrder = { id ->
                            navController.navigate(Screen.OrderDetail.createRoute(id))
                        },
                        onScheduleInstallation = { id ->
                            navController.navigate(Screen.Installation.createRoute(id))
                        },
                        onReturnHome = { navController.navigateToTab(Screen.Home) },
                        bottomPadding = contentBottomPadding
                    )
                } else {
                    ProjectLoadingScreen()
                }
            }

            // Customer Orders List
            composable(Screen.Orders.route) {
                if (!pricesVisible) {
                    LaunchedEffect(Unit) { navController.navigate(Screen.Login.route) }
                } else {
                    OrdersScreen(
                        orderRepository = orderRepository,
                        onBack = { navController.popBackStack() },
                        onOpenOrder = { orderId ->
                            navController.navigate(Screen.OrderDetail.createRoute(orderId))
                        },
                        onBrowseCatalog = { navController.navigateToTab(Screen.Products) },
                        bottomPadding = contentBottomPadding
                    )
                }
            }

            // Customer Order Detail
            composable(Screen.OrderDetail.route) { entry ->
                val orderId = entry.arguments?.getString("orderId").orEmpty()
                val orders by orderRepository.orders.collectAsState()
                val reviews by feedbackRepository.reviews.collectAsState()
                val order = orders.firstOrNull { it.id == orderId }
                val hasReviewed = order?.items?.all { item ->
                    reviews.any { it.orderId == orderId && it.panelId == item.panelId }
                } == true
                val review = reviews.firstOrNull { it.orderId == orderId }
                val detailScope = rememberCoroutineScope()
                val uriHandler = LocalUriHandler.current
                var isBusy by remember(orderId) { mutableStateOf(false) }
                var actionError by remember(orderId) { mutableStateOf<String?>(null) }
                // Fresh status and payment each time the page opens, and when coming back from GCash.
                val lifecycleOwner = LocalLifecycleOwner.current
                DisposableEffect(orderId, lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_RESUME) detailScope.launch { orderRepository.fetchOrder(orderId) }
                    }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                }
                if (!pricesVisible) {
                    LaunchedEffect(Unit) { navController.navigate(Screen.Login.route) }
                } else if (order != null) {
                    OrderDetailScreen(
                        order = order,
                        onBack = { navController.popBackStack() },
                        onLeaveFeedback = { id ->
                            navController.navigate(Screen.Feedback.createRoute(id))
                        },
                        onViewInstallation = { id ->
                            navController.navigate(Screen.Installation.createRoute(id))
                        },
                        hasReviewed = hasReviewed,
                        review = review,
                        isBusy = isBusy,
                        actionError = actionError,
                        onPay = {
                            isBusy = true
                            actionError = null
                            detailScope.launch {
                                orderRepository.startPayment(orderId)
                                    .onSuccess { url -> uriHandler.openUri(url) }
                                    .onFailure { actionError = it.message }
                                isBusy = false
                            }
                        },
                        onCancel = {
                            isBusy = true
                            actionError = null
                            detailScope.launch {
                                orderRepository.cancelOrder(orderId).onFailure { actionError = it.message }
                                isBusy = false
                            }
                        },
                        bottomPadding = contentBottomPadding
                    )
                } else {
                    ProjectLoadingScreen()
                }
            }

            // Installation Service Booking
            composable(
                route = Screen.Installation.route,
                arguments = listOf(
                    navArgument("orderId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    }
                )
            ) { entry ->
                val orderId = entry.arguments?.getString("orderId")
                LaunchedEffect(orderId) {
                    installationViewModel.setInitialOrder(orderId)
                }
                InstallationScreen(
                    viewModel = installationViewModel,
                    onBack = { navController.popBackStack() },
                    bottomPadding = contentBottomPadding
                )
            }

            // Customer Reviews & Feedback
            composable(
                route = Screen.Feedback.route,
                arguments = listOf(
                    navArgument("orderId") {
                        type = NavType.StringType
                        nullable = true
                        defaultValue = null
                    }
                )
            ) { entry ->
                val orderId = entry.arguments?.getString("orderId")
                LaunchedEffect(orderId) {
                    feedbackViewModel.setInitialOrder(orderId)
                }
                FeedbackScreen(
                    viewModel = feedbackViewModel,
                    onBack = { navController.popBackStack() },
                    bottomPadding = contentBottomPadding
                )
            }

            // About Disenyo Interior Solution
            composable(Screen.About.route) {
                AboutScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToProducts = { navController.navigateToTab(Screen.Products) }
                )
            }

            // Legal & Compliance: Privacy Policy
            composable(Screen.PrivacyPolicy.route) {
                PrivacyPolicyScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToTerms = {
                        navController.navigate(Screen.TermsAndConditions.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }

            // Legal & Compliance: Terms of Service
            composable(Screen.TermsAndConditions.route) {
                TermsAndConditionsScreen(
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToPrivacyPolicy = {
                        navController.navigate(Screen.PrivacyPolicy.route) {
                            launchSingleTop = true
                        }
                    }
                )
            }
        }

        if (showBottomBar) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .onSizeChanged { size ->
                        val measured = with(density) { size.height.toDp() }
                        if (measured != bottomBarHeight) bottomBarHeight = measured
                    }
            ) {
                PanelScanBottomNav(
                    currentRoute = currentRoute,
                    onDestinationSelected = navController::navigateToTab
                )
            }
        }
    }
}

@Composable
private fun ProjectLoadingScreen() {
    ScreenScaffold(animateContentIn = false) {
        LoadingState(
            message = "Opening project…",
            modifier = Modifier.align(Alignment.Center)
        )
    }
}

@Composable
private fun rememberProject(
    projectId: String?,
    projects: List<SavedProject>,
    repository: ProjectRepository
): SavedProject? {
    var loaded by remember(projectId) { mutableStateOf<SavedProject?>(null) }
    val fromList = projects.firstOrNull { it.id == projectId }

    LaunchedEffect(projectId, fromList) {
        if (fromList == null && projectId != null) {
            loaded = repository.getProjectById(projectId)
        }
    }
    return fromList ?: loaded
}

/**
 * Reliable tab navigation preventing duplicate instances and ensuring
 * clicking Home cleanly pops back to root Home.
 */
private fun NavHostController.navigateToTab(screen: Screen) {
    if (screen == Screen.Home) {
        val popped = popBackStack(Screen.Home.route, inclusive = false)
        if (!popped) {
            navigate(Screen.Home.route) {
                popUpTo(0) { inclusive = false }
                launchSingleTop = true
            }
        }
    } else {
        navigate(screen.navigationRoute) {
            popUpTo(Screen.Home.route) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }
}

private fun projectsViewModelFactory(
    repository: ProjectRepository,
    onProjectSaved: (SavedProject) -> Unit
) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ProjectsViewModel(repository, onProjectSaved) as T
    }

private fun authViewModelFactory(repository: AuthRepository) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AuthViewModel(repository) as T
    }

private fun chatViewModelFactory(repository: ChatRepository, sessionManager: SessionManager) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            ChatViewModel(repository, sessionManager) as T
    }

private fun cartViewModelFactory(repository: CartRepository) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            CartViewModel(repository) as T
    }

private fun checkoutViewModelFactory(
    cartRepository: CartRepository,
    orderRepository: OrderRepository,
    addressRepository: AddressRepository
) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            CheckoutViewModel(cartRepository, orderRepository, addressRepository) as T
    }

private fun addressFormViewModelFactory(addressRepository: AddressRepository, sessionManager: SessionManager) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AddressFormViewModel(addressRepository, sessionManager) as T
    }

private fun installationViewModelFactory(
    installationRepository: InstallationRepository,
    orderRepository: OrderRepository,
    sessionManager: SessionManager
) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            InstallationViewModel(installationRepository, orderRepository, sessionManager) as T
    }

private fun feedbackViewModelFactory(
    feedbackRepository: FeedbackRepository,
    orderRepository: OrderRepository,
    sessionManager: SessionManager
) =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            FeedbackViewModel(feedbackRepository, orderRepository, sessionManager) as T
    }
