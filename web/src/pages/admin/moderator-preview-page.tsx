import { AdminPreviewWorkspace } from "@/components/admin/admin-preview-workspace"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function ModeratorPreviewPage() {
  useDocumentTitle("Moderator preview | PanelScan")
  return <AdminPreviewWorkspace role="MODERATOR" />
}
