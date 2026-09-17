import { PlaceholderScreen } from '../../components/common/PlaceholderScreen';

/**
 * Read-only oversight: OWNER can view every conversation but cannot send
 * messages or mark them read (verified in chat.routes.ts). Not in this task's
 * original screen list, added after cross-checking against the backend.
 */
export default function ChatScreen() {
  return <PlaceholderScreen title="Chat" description="GET /api/chat (view-only)" />;
}
