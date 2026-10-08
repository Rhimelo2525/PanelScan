package com.example.panelscan.data.repository

import com.example.panelscan.core.network.ApiClient
import com.example.panelscan.core.network.ApiException
import com.example.panelscan.core.session.SessionManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.Serializable

data class Conversation(
    val id: String,
    val subject: String?,
    /** ISO-8601 time of the latest message (or of the conversation, when it has none yet). */
    val updatedAt: String,
    val unreadCount: Int = 0
)

data class ChatMessage(
    val id: String,
    val conversationId: String,
    /** Null for the backend's automated "we'll reply soon" message. */
    val senderId: String?,
    val content: String,
    val isCustomer: Boolean,
    val senderName: String,
    /** ISO-8601, UTC ("2026-10-08T14:03:00.000Z"). */
    val createdAt: String,
    val isSending: Boolean = false,
    val isFailed: Boolean = false
)

/**
 * Customer support chat with the PanelScan team (/api/chat), the same
 * conversation as the website's Messages page. Each customer has one ongoing
 * conversation, opened with their first message and reused after that; a
 * moderator answers from the admin inbox. Opening a thread marks the team's
 * replies as read (backend). There is no realtime transport, so the screen polls.
 */
class ChatRepository(
    private val sessionManager: SessionManager,
    private val api: ApiClient
) {

    fun getConversations(): Flow<Resource<List<Conversation>>> = flow {
        if (!sessionManager.isLoggedIn()) {
            emit(Resource.Error("Please log in to access customer support messages.", emptyList()))
            return@flow
        }
        try {
            val result: ConversationPage = api.get("/chat?limit=30", authenticated = true)
            // Most recent activity first, as on the website.
            emit(Resource.Success(result.conversations.map { it.toConversation() }.sortedByDescending { it.updatedAt }))
        } catch (error: ApiException) {
            emit(Resource.Error(error.message.orEmpty()))
        }
    }

    /** Opens the customer's support conversation, or returns the one already ongoing. */
    suspend fun createConversation(subject: String?): Result<Conversation> = call {
        val result: ConversationResponse = api.post("/chat", CreateRequest(subject?.trim()?.ifBlank { null }), authenticated = true)
        result.conversation.toConversation()
    }

    fun getMessages(conversationId: String): Flow<Resource<List<ChatMessage>>> = flow {
        if (!sessionManager.isLoggedIn()) {
            emit(Resource.Error("Please log in to view message history.", emptyList()))
            return@flow
        }
        try {
            emit(Resource.Success(fetchMessages(conversationId)))
        } catch (error: ApiException) {
            emit(Resource.Error(error.message.orEmpty()))
        }
    }

    /** The latest 100 messages, oldest first (the backend pages newest first). */
    suspend fun fetchMessages(conversationId: String): List<ChatMessage> {
        val result: MessagePage = api.get("/chat/$conversationId/messages?limit=100", authenticated = true)
        return result.messages.map { it.toMessage() }.reversed()
    }

    suspend fun sendMessage(conversationId: String, content: String): Result<ChatMessage> {
        val trimmed = content.trim()
        if (trimmed.isEmpty()) return Result.failure(IllegalArgumentException("Message cannot be empty."))
        return call {
            val result: MessageResponse = api.post("/chat/$conversationId/messages", SendRequest(trimmed), authenticated = true)
            result.message.toMessage()
        }
    }

    suspend fun retryMessage(conversationId: String, failedMessage: ChatMessage): Result<ChatMessage> =
        sendMessage(conversationId, failedMessage.content)

    /** Unread replies from the team, for a badge; 0 when signed out or offline. */
    suspend fun getUnreadCount(): Int {
        if (!sessionManager.isLoggedIn()) return 0
        return try {
            api.get<UnreadCount>("/chat/unread/count", authenticated = true).count
        } catch (error: ApiException) {
            0
        }
    }

    private suspend fun <T> call(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (error: ApiException) {
        Result.failure(IllegalStateException(error.message))
    }

    private fun ApiConversation.toConversation() = Conversation(
        id = id,
        subject = subject,
        updatedAt = latestMessage?.createdAt ?: updatedAt,
        unreadCount = unreadCount
    )

    private fun ApiMessage.toMessage(): ChatMessage {
        val myId = sessionManager.getCurrentUser()?.id
        return ChatMessage(
            id = id,
            conversationId = chatRoomId,
            senderId = senderId,
            content = content,
            isCustomer = senderId != null && senderId == myId,
            senderName = when {
                sender != null -> "${sender.firstName} ${sender.lastName}".trim()
                senderId == null -> "PanelScan Support · Auto-reply"
                else -> "PanelScan team"
            },
            createdAt = createdAt
        )
    }

    @Serializable
    private data class ApiSender(val firstName: String, val lastName: String)

    @Serializable
    private data class ApiMessage(
        val id: String,
        val chatRoomId: String,
        val senderId: String? = null,
        val content: String,
        val createdAt: String,
        val sender: ApiSender? = null
    )

    @Serializable
    private data class ApiConversation(
        val id: String,
        val subject: String? = null,
        val updatedAt: String,
        val latestMessage: ApiMessage? = null,
        val unreadCount: Int = 0
    )

    @Serializable
    private data class ConversationPage(val conversations: List<ApiConversation>)

    @Serializable
    private data class ConversationResponse(val conversation: ApiConversation)

    @Serializable
    private data class MessagePage(val messages: List<ApiMessage>)

    @Serializable
    private data class MessageResponse(val message: ApiMessage)

    @Serializable
    private data class UnreadCount(val count: Int)

    @Serializable
    private data class CreateRequest(val subject: String?)

    @Serializable
    private data class SendRequest(val content: String)
}
