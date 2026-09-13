import { AdminPreviewWorkspace } from "@/components/admin/admin-preview-workspace"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function AdminPreviewPage() {
  useDocumentTitle("Owner preview | PanelScan")
  return <AdminPreviewWorkspace role="OWNER" />
}
