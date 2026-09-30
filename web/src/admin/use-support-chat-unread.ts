import { useCallback, useEffect, useState } from "react"

import { getUnreadCount } from "@/api/support"
import { useSilentPolling } from "@/hooks/use-silent-polling"
import { CHAT_READ_EVENT } from "@/lib/chat"

/**
 * Whether the staff support inbox has customer messages nobody on staff has
 * read yet (GET /chat/unread/count, the same read state the conversation list
 * uses). Polls like the rest of the admin, and refreshes at once when the chat
 * page opens a conversation and marks it read.
 */
export function useSupportChatUnread(enabled: boolean): boolean {
  const [count, setCount] = useState(0)

  const refresh = useCallback(() => (enabled ? getUnreadCount().then(setCount).catch(() => {}) : Promise.resolve()), [enabled])

  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return
    }
    void refresh()
    const handleRead = () => { void refresh() }
    window.addEventListener(CHAT_READ_EVENT, handleRead)
    return () => window.removeEventListener(CHAT_READ_EVENT, handleRead)
  }, [enabled, refresh])

  useSilentPolling(refresh, enabled ? 20_000 : false)

  return count > 0
}
