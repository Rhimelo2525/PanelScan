package com.example.panelscan.feature.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.panelscan.R
import com.example.panelscan.core.design.PanelScan
import com.example.panelscan.core.design.Spacing
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.ui.EmptyState
import com.example.panelscan.core.ui.IconAffordance
import com.example.panelscan.core.ui.PanelCard
import com.example.panelscan.core.ui.PanelScanTextField
import com.example.panelscan.core.ui.PanelScanTopBar
import com.example.panelscan.core.ui.PrimaryButton
import com.example.panelscan.core.ui.ScreenScaffold
import com.example.panelscan.data.repository.ChatMessage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ChatScreen(
    viewModel: ChatViewModel,
    onBack: () -> Unit,
    onNavigateToSignIn: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 0.dp
) {
    val state by viewModel.uiState.collectAsState()
    val sessionState by viewModel.sessionState.collectAsState()
    val colors = PanelScan.colors
    val listState = rememberLazyListState()
    val focusManager = LocalFocusManager.current
    var showNewConversationDialog by remember { mutableStateOf(false) }

    // Load and keep the thread fresh while this screen is open.
    DisposableEffect(Unit) {
        viewModel.startPolling()
        onDispose {
            viewModel.stopPolling()
        }
    }

    LaunchedEffect(state.messages.size) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.size - 1)
        }
    }

    ScreenScaffold(modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .imePadding()
        ) {
            val activeConv = state.conversations.firstOrNull { it.id == state.activeConversationId }
            val screenTitle = activeConv?.subject ?: "Customer Support"

            PanelScanTopBar(
                title = screenTitle,
                subtitle = if (sessionState is CustomerSessionState.LoggedIn) "Disenyo Interior Solution Team" else null,
                onBack = onBack,
                actions = {
                    if (sessionState is CustomerSessionState.LoggedIn) {
                        IconAffordance(onClick = { showNewConversationDialog = !showNewConversationDialog }) {
                            Icon(
                                imageVector = Icons.Rounded.Add,
                                contentDescription = "New enquiry",
                                tint = colors.textPrimary,
                                modifier = Modifier.padding(2.dp)
                            )
                        }
                        IconAffordance(onClick = { viewModel.refreshActiveThread() }) {
                            Icon(
                                imageVector = Icons.Rounded.Refresh,
                                contentDescription = "Refresh messages",
                                tint = colors.textPrimary,
                                modifier = Modifier.padding(2.dp)
                            )
                        }
                    }
                }
            )

            when (sessionState) {
                is CustomerSessionState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = colors.accent, modifier = Modifier.size(32.dp))
                    }
                }
                is CustomerSessionState.LoggedOut -> {
                    // Logged-out state: Invite customer to sign in
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = Spacing.gutter, vertical = Spacing.xl),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(PanelScan.shapes.card)
                                .background(colors.accentSoft),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.SupportAgent,
                                contentDescription = null,
                                tint = colors.accent,
                                modifier = Modifier.size(32.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(Spacing.md))

                        Text(
                            text = "Customer Support Messages",
                            style = PanelScan.type.title,
                            color = colors.textPrimary
                        )

                        Text(
                            text = "Log in to chat with our interior architects, ask questions about panel selection and room coverage, and track your ongoing project enquiries.",
                            style = PanelScan.type.body,
                            color = colors.textSecondary,
                            modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(Spacing.md))

                        PrimaryButton(
                            text = "Log In to Access Chat",
                            onClick = onNavigateToSignIn,
                            icon = Icons.Rounded.Lock,
                            modifier = Modifier.fillMaxWidth(0.8f)
                        )
                    }
                }
                is CustomerSessionState.LoggedIn -> {
                    // Logged-in Chat UI
                    Column(modifier = Modifier.fillMaxSize()) {
                        // Optional New Conversation Header Expandable
                        AnimatedVisibility(visible = showNewConversationDialog) {
                            PanelCard(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = Spacing.gutter, vertical = Spacing.xs),
                                contentPadding = PaddingValues(Spacing.sm)
                            ) {
                                Column(verticalArrangement = Arrangement.spacedBy(Spacing.xs)) {
                                    Text(
                                        text = "Start a new conversation",
                                        style = PanelScan.type.cardTitle,
                                        color = colors.textPrimary
                                    )
                                    PanelScanTextField(
                                        value = state.newSubjectText,
                                        onValueChange = viewModel::onNewSubjectChange,
                                        label = "Subject (optional)",
                                        placeholder = "e.g. Wall panel estimate for 4x3m dining room",
                                        enabled = !state.isStartingNew
                                    )
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.End
                                    ) {
                                        TextButton(onClick = { showNewConversationDialog = false }) {
                                            Text("Cancel", color = colors.textSecondary)
                                        }
                                        PrimaryButton(
                                            text = if (state.isStartingNew) "Creating…" else "Start",
                                            onClick = {
                                                viewModel.createNewConversation {
                                                    showNewConversationDialog = false
                                                }
                                            },
                                            enabled = !state.isStartingNew,
                                            fillMaxWidth = false
                                        )
                                    }
                                }
                            }
                        }

                        // Message Thread
                        if (state.messages.isEmpty() && !state.isLoadingMessages) {
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                EmptyState(
                                    icon = Icons.Rounded.SupportAgent,
                                    title = "No messages yet",
                                    description = "Send a message below and our interior team will answer here."
                                )
                            }
                        } else {
                            LazyColumn(
                                state = listState,
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth(),
                                contentPadding = PaddingValues(
                                    horizontal = Spacing.gutter,
                                    vertical = Spacing.sm
                                ),
                                verticalArrangement = Arrangement.spacedBy(Spacing.sm)
                            ) {
                                items(state.messages, key = { it.id }) { msg ->
                                    ChatMessageBubble(
                                        message = msg,
                                        onRetry = { viewModel.retryMessage(msg) }
                                    )
                                }
                            }
                        }

                        HorizontalDivider(color = colors.border, thickness = 1.dp)

                        // Input bar
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(colors.surface)
                                .padding(horizontal = Spacing.gutter, vertical = Spacing.xs),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(Spacing.xs)
                        ) {
                            OutlinedTextField(
                                value = state.draftText,
                                onValueChange = viewModel::onDraftChange,
                                placeholder = {
                                    Text(
                                        text = "Type your message…",
                                        style = PanelScan.type.body,
                                        color = colors.textTertiary
                                    )
                                },
                                modifier = Modifier.weight(1f),
                                maxLines = 4,
                                textStyle = PanelScan.type.body.copy(color = colors.textPrimary),
                                shape = PanelScan.shapes.control,
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                                keyboardActions = KeyboardActions(onSend = {
                                    focusManager.clearFocus()
                                    viewModel.sendMessage()
                                }),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedContainerColor = colors.surface,
                                    unfocusedContainerColor = colors.surface,
                                    focusedBorderColor = colors.accent,
                                    unfocusedBorderColor = colors.borderStrong
                                )
                            )

                            IconButton(
                                onClick = {
                                    focusManager.clearFocus()
                                    viewModel.sendMessage()
                                },
                                enabled = !state.isSending && state.draftText.isNotBlank(),
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(PanelScan.shapes.control)
                                    .background(
                                        if (state.draftText.isNotBlank() && !state.isSending) colors.surfaceInverse
                                        else colors.surfaceMuted
                                    )
                            ) {
                                if (state.isSending) {
                                    CircularProgressIndicator(
                                        color = colors.accent,
                                        modifier = Modifier.size(20.dp),
                                        strokeWidth = 2.dp
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.AutoMirrored.Rounded.Send,
                                        contentDescription = "Send message",
                                        tint = if (state.draftText.isNotBlank()) colors.textInverse else colors.textTertiary,
                                        modifier = Modifier.size(20.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatMessageBubble(
    message: ChatMessage,
    onRetry: () -> Unit
) {
    val colors = PanelScan.colors
    val isMine = message.isCustomer

    val bubbleShape = if (isMine) {
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp)
    } else {
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 4.dp, bottomEnd = 16.dp)
    }

    val bubbleBackground = if (isMine) colors.surfaceInverse else colors.surface
    val textColor = if (isMine) colors.textInverse else colors.textPrimary
    val borderColor = if (isMine) Color.Transparent else colors.borderStrong

    val formattedTime = remember(message.createdAt) {
        runCatching {
            // The backend sends UTC; show the phone's local time.
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
            val formatter = SimpleDateFormat("h:mm a", Locale.US)
            val parsed = parser.parse(message.createdAt.take(19))
            if (parsed != null) formatter.format(parsed) else ""
        }.getOrDefault("")
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Bottom
    ) {
        if (!isMine) {
            Image(
                painter = painterResource(id = R.drawable.panelscan_logo),
                contentDescription = "Disenyo Interior Solution Consultant",
                modifier = Modifier
                    .padding(end = 6.dp, bottom = 4.dp)
                    .size(28.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, colors.border, RoundedCornerShape(8.dp))
            )
        }

        Column(
            horizontalAlignment = if (isMine) Alignment.End else Alignment.Start
        ) {
            // Bubble
            Box(
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .clip(bubbleShape)
                    .background(bubbleBackground)
                    .border(1.dp, borderColor, bubbleShape)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = message.content,
                        style = PanelScan.type.body,
                        color = textColor
                    )

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Text(
                            text = if (isMine) "You" else message.senderName,
                            style = PanelScan.type.label,
                            color = if (isMine) colors.textInverse.copy(alpha = 0.7f) else colors.textTertiary
                        )
                        if (formattedTime.isNotBlank()) {
                            Text(
                                text = "· $formattedTime",
                                style = PanelScan.type.label,
                                color = if (isMine) colors.textInverse.copy(alpha = 0.7f) else colors.textTertiary
                            )
                        }
                    }
                }
            }

        // Retry / Sending indicator
        if (message.isSending) {
            Text(
                text = "Sending…",
                style = PanelScan.type.label,
                color = colors.textTertiary,
                modifier = Modifier.padding(top = 2.dp, end = 4.dp)
            )
        } else if (message.isFailed) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(top = 2.dp, end = 4.dp)
            ) {
                Icon(
                    imageVector = Icons.Rounded.ErrorOutline,
                    contentDescription = null,
                    tint = colors.destructive,
                    modifier = Modifier.size(12.dp)
                )
                Text(
                    text = "Failed to send",
                    style = PanelScan.type.label,
                    color = colors.destructive
                )
                TextButton(
                    onClick = onRetry,
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Text(
                        text = "Retry",
                        style = PanelScan.type.label,
                        color = colors.accent
                    )
                }
            }
        }
    }
}
}
