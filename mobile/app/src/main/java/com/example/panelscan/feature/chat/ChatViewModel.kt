package com.example.panelscan.feature.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.panelscan.core.session.CustomerSessionState
import com.example.panelscan.core.session.SessionManager
import com.example.panelscan.data.repository.ChatMessage
import com.example.panelscan.data.repository.ChatRepository
import com.example.panelscan.data.repository.Conversation
import com.example.panelscan.data.repository.Resource
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class ChatUiState(
    val conversations: List<Conversation> = emptyList(),
    val activeConversationId: String? = null,
    val messages: List<ChatMessage> = emptyList(),
    val isLoadingConversations: Boolean = false,
    val isLoadingMessages: Boolean = false,
    val isSending: Boolean = false,
    val isStartingNew: Boolean = false,
    val draftText: String = "",
    val newSubjectText: String = "",
    val errorMessage: String? = null,
    val unreadCount: Int = 0
)

class ChatViewModel(
    private val chatRepository: ChatRepository,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()
    val sessionState: StateFlow<CustomerSessionState> = sessionManager.sessionState

    private var pollingJob: Job? = null

    /** Whose messages are on screen, so another customer signing in never sees them. */
    private var shownUserId: String? = null

    fun onDraftChange(text: String) {
        _uiState.update { it.copy(draftText = text) }
    }

    fun onNewSubjectChange(text: String) {
        _uiState.update { it.copy(newSubjectText = text) }
    }

    fun loadConversations(autoSelectFirst: Boolean = true) {
        viewModelScope.launch {
            chatRepository.getConversations().collect { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update {
                            it.copy(
                                isLoadingConversations = true,
                                conversations = resource.cachedData ?: it.conversations
                            )
                        }
                    }
                    is Resource.Success -> {
                        val convs = resource.data
                        val activeId = _uiState.value.activeConversationId
                        val targetId = if (activeId != null && convs.any { it.id == activeId }) {
                            activeId
                        } else if (autoSelectFirst && convs.isNotEmpty()) {
                            convs.first().id
                        } else {
                            null
                        }

                        _uiState.update {
                            it.copy(
                                isLoadingConversations = false,
                                conversations = convs,
                                activeConversationId = targetId,
                                errorMessage = null
                            )
                        }

                        if (targetId != null && targetId != activeId) {
                            selectConversation(targetId)
                        }
                    }
                    is Resource.Error -> {
                        _uiState.update {
                            it.copy(
                                isLoadingConversations = false,
                                conversations = resource.cachedData ?: it.conversations,
                                errorMessage = resource.message
                            )
                        }
                    }
                }
            }
        }
    }

    fun selectConversation(conversationId: String) {
        _uiState.update { it.copy(activeConversationId = conversationId, errorMessage = null) }
        loadMessages(conversationId)
    }

    fun createNewConversation(subject: String? = null, onCreated: () -> Unit = {}) {
        val cleanSubject = subject ?: _uiState.value.newSubjectText.trim().ifBlank { null }
        _uiState.update { it.copy(isStartingNew = true, errorMessage = null) }

        viewModelScope.launch {
            chatRepository.createConversation(cleanSubject).onSuccess { conversation ->
                _uiState.update {
                    it.copy(
                        isStartingNew = false,
                        newSubjectText = "",
                        activeConversationId = conversation.id,
                        conversations = listOf(conversation) + it.conversations.filter { c -> c.id != conversation.id }
                    )
                }
                loadMessages(conversation.id)
                onCreated()
            }.onFailure { err ->
                _uiState.update { it.copy(isStartingNew = false, errorMessage = err.localizedMessage) }
            }
        }
    }

    fun sendMessage() {
        val draft = _uiState.value.draftText.trim()
        if (draft.isBlank() || _uiState.value.isSending) return

        _uiState.update { it.copy(isSending = true, draftText = "", errorMessage = null) }

        viewModelScope.launch {
            // As on the website, the first message opens the conversation (or finds the
            // ongoing one), so the team's inbox never fills with empty chats.
            val activeId = _uiState.value.activeConversationId
                ?: chatRepository.createConversation(null).getOrElse { err ->
                    _uiState.update { it.copy(isSending = false, draftText = draft, errorMessage = err.localizedMessage) }
                    return@launch
                }.also { conversation ->
                    _uiState.update {
                        it.copy(
                            activeConversationId = conversation.id,
                            conversations = listOf(conversation) + it.conversations.filter { c -> c.id != conversation.id }
                        )
                    }
                }.id

            chatRepository.sendMessage(activeId, draft).onSuccess {
                _uiState.update { it.copy(isSending = false) }
                loadMessages(activeId)
            }.onFailure { err ->
                // Keep what they typed so it can be sent again.
                _uiState.update { it.copy(isSending = false, draftText = draft, errorMessage = err.localizedMessage) }
            }
        }
    }

    fun retryMessage(message: ChatMessage) {
        val activeId = _uiState.value.activeConversationId ?: return
        viewModelScope.launch {
            chatRepository.retryMessage(activeId, message).onSuccess {
                loadMessages(activeId)
            }.onFailure {
                loadMessages(activeId)
            }
        }
    }

    fun refreshActiveThread() {
        val activeId = _uiState.value.activeConversationId ?: return
        loadMessages(activeId)
    }

    private fun loadMessages(conversationId: String) {
        viewModelScope.launch {
            chatRepository.getMessages(conversationId).collect { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update {
                            it.copy(
                                isLoadingMessages = it.messages.isEmpty(),
                                messages = resource.cachedData ?: it.messages
                            )
                        }
                    }
                    is Resource.Success -> {
                        _uiState.update {
                            it.copy(
                                isLoadingMessages = false,
                                messages = resource.data
                            )
                        }
                    }
                    is Resource.Error -> {
                        _uiState.update {
                            it.copy(
                                isLoadingMessages = false,
                                messages = resource.cachedData ?: it.messages
                            )
                        }
                    }
                }
            }
        }
    }

    /**
     * Called when the chat screen opens: loads the conversation, then quietly
     * re-fetches the thread every few seconds so a moderator's reply shows up
     * without a manual refresh (the website polls the same way). A failed poll
     * leaves the thread as it is.
     */
    fun startPolling() {
        val userId = sessionManager.getCurrentUser()?.id
        if (userId != shownUserId) {
            shownUserId = userId
            _uiState.value = ChatUiState()
        }
        loadConversations()
        pollingJob?.cancel()
        pollingJob = viewModelScope.launch {
            while (isActive) {
                delay(POLL_INTERVAL_MS)
                val activeId = _uiState.value.activeConversationId ?: continue
                runCatching { chatRepository.fetchMessages(activeId) }
                    .onSuccess { messages -> _uiState.update { it.copy(messages = messages) } }
            }
        }
    }

    fun stopPolling() {
        pollingJob?.cancel()
        pollingJob = null
    }

    override fun onCleared() {
        stopPolling()
        super.onCleared()
    }

    private companion object {
        const val POLL_INTERVAL_MS = 8_000L
    }
}
