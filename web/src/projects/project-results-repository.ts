import { customerProjectFallback } from "@/data/customer-project-fallback"
import type { CustomerProjectResultSet } from "@/types/customer-project"

export async function listCustomerProjectResults(): Promise<CustomerProjectResultSet> {
  await Promise.resolve()
  return {
    projects: customerProjectFallback,
    source: "DEMO_FALLBACK",
    notice: "Sample project results for interface review. No mobile measurements are synced to this website yet.",
  }
}
