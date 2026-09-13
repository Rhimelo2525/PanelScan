import type { PreviewConversation } from "@/preview/support-policy"
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

const timeFormatter = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" })

export function ConversationThread({ conversation, viewer }: { conversation: PreviewConversation; viewer: "CUSTOMER" | "MODERATOR" }) {
  const threadRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const scroller = threadRef.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [conversation.id, conversation.messages.length])
  return <div ref={threadRef} className="max-h-[28rem] min-w-0 overflow-y-auto p-5"><ol className="min-w-0 space-y-3" aria-label="Conversation messages" aria-live="polite">
    {conversation.messages.map((message) => {
      const own = message.sender === viewer
      return <li key={message.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
        <div className={cn("max-w-[88%] rounded-xl px-4 py-3 sm:max-w-[75%]", own ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/60 text-foreground")}>
          <p className="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>
          <p className={cn("mt-1 text-[0.68rem]", own ? "text-primary-foreground/75" : "text-muted-foreground")}>{message.sender === "CUSTOMER" ? "Customer" : "Moderator"} · {timeFormatter.format(new Date(message.sentAt))}</p>
        </div>
      </li>
    })}
  </ol></div>
}
