import { FolderOpen } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"

/** A project code anywhere in a message, e.g. "PRJ-2026-1A2B3C4D". */
const PROJECT_CODE_IN_TEXT = /\bPRJ-\d{4}-[0-9A-F]{8}\b/gi

interface MessageContentProps {
  content: string
  /** Where a project code in the message leads, for the viewer's side of the site. */
  projectLink: (code: string) => string
}

/** A chat message's text, with each project code turned into a link that opens the project. */
export function MessageContent({ content, projectLink }: MessageContentProps) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of content.matchAll(PROJECT_CODE_IN_TEXT)) {
    const start = match.index ?? 0
    if (start > last) parts.push(content.slice(last, start))
    const code = match[0].toUpperCase()
    parts.push(
      <Link
        key={start}
        to={projectLink(code)}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 align-baseline font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        title="Open this project"
      >
        <FolderOpen className="size-3" aria-hidden="true" />{code}
      </Link>,
    )
    last = start + match[0].length
  }
  if (last < content.length) parts.push(content.slice(last))
  return <>{parts}</>
}
