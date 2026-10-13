import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createConversation, getConversationMessages, getMyConversations, postMessage } from "@/api/support"
import { useSilentPolling } from "@/hooks/use-silent-polling"
import { sortConversationsByActivity } from "@/lib/chat"
import type { ChatMessage } from "@/types/admin"

/**
 * The customer's support conversation with the PanelScan team, shared by the
 * Messages page and the small chat window. Each customer has one ongoing
 * conversation: it is created with their first message (so the team's inbox
 * never fills with empty chats) and reused from then on. There is no realtime
 * transport, so the thread is refreshed on send, on a quiet poll and on demand.
 * Nothing loads while [enabled] is false (the chat window is closed).
 */
export function useSupportConversation(enabled = true) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [threadKey, setThreadKey] = useState(0)
  // Guards against a second send before the first finishes (e.g. Enter pressed twice quickly).
  const sendingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setLoadError(null)
    getMyConversations(controller.signal)
      .then((result) => setConversationId(sortConversationsByActivity(result)[0]?.id ?? null))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setLoadError("Your messages could not be loaded. Please try again.")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [enabled])

  useEffect(() => {
    if (!enabled || !conversationId) return
    const controller = new AbortController()
    setIsLoadingThread(true)
    getConversationMessages(conversationId, controller.signal)
      .then(setMessages)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast.error("Messages could not be loaded")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingThread(false) })
    return () => controller.abort()
  }, [enabled, conversationId, threadKey])

  // A moderator's reply should appear without a manual refresh. Only a
  // successful response is applied - a transient failure leaves the thread
  // as it is, matching the manual "Refresh" button.
  useSilentPolling(
    useCallback(() => {
      if (!conversationId) return Promise.resolve()
      return getConversationMessages(conversationId).then(setMessages).catch(() => {})
    }, [conversationId]),
    enabled && conversationId ? 8_000 : false,
  )

  const refresh = useCallback(() => setThreadKey((value) => value + 1), [])

  /** Sends [draft]; true once it is in the conversation. */
  async function send(draft: string): Promise<boolean> {
    const content = draft.trim()
    if (content.length === 0 || sendingRef.current) return false
    sendingRef.current = true
    setIsSending(true)
    try {
      // The first message opens the conversation (or finds the one already
      // open in another tab). The thread only starts loading once the message
      // is in, so the load never races the send.
      const id = conversationId ?? (await createConversation()).id
      await postMessage(id, content)
      if (conversationId) refresh()
      else setConversationId(id)
      return true
    } catch {
      toast.error("Message not sent", { description: "Please try again in a moment." })
      return false
    } finally {
      sendingRef.current = false
      setIsSending(false)
    }
  }

  return { conversationId, messages, isLoading, isLoadingThread, loadError, isSending, refresh, send }
}
