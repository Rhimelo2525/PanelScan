export interface AdminReviewMetric {
  label: string
  value: string
  hint: string
}

export interface AdminReviewColumn {
  key: string
  label: string
  numeric?: boolean
  secondary?: boolean
}

export interface AdminReviewRow {
  id: string
  [key: string]: string
}

export interface AdminReviewSection {
  id: string
  label: string
  eyebrow: string
  title: string
  description: string
  note: string
  metrics: AdminReviewMetric[]
  columns: AdminReviewColumn[]
  rows: AdminReviewRow[]
}

/** Fictional records isolated from the authenticated Admin and API. */
export const adminReviewSections: AdminReviewSection[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    eyebrow: "Review overview",
    title: "Business and operations snapshot",
    description: "A shared business view of sales, inventory, projects, and service activity.",
    note: "Metrics are illustrative sample values for interface review only.",
    metrics: [
      { label: "Gross revenue", value: "₱284,760", hint: "Sample completed and active orders" },
      { label: "Orders", value: "46", hint: "Across 31 sample customers" },
      { label: "Active projects", value: "12", hint: "Measurements and installations" },
      { label: "Low stock items", value: "3", hint: "Require inventory review" },
    ],
    columns: [
      { key: "activity", label: "Recent activity" },
      { key: "area", label: "Area" },
      { key: "status", label: "Status" },
      { key: "updated", label: "Updated", secondary: true },
    ],
    rows: [
      { id: "activity-1", activity: "Order PS-1046 prepared for delivery", area: "Sales", status: "PROCESSING", updated: "Today, 10:20 AM" },
      { id: "activity-2", activity: "Living room feature wall measured", area: "Projects", status: "IN_PROGRESS", updated: "Today, 9:05 AM" },
      { id: "activity-3", activity: "PVC ceiling tile stock adjusted", area: "Inventory", status: "LOW_STOCK", updated: "Yesterday" },
    ],
  },
  {
    id: "products",
    label: "Products",
    eyebrow: "Catalogue",
    title: "PVC product management",
    description: "Review how product identity, finish, pricing visibility, and catalogue status are presented.",
    note: "Product updates can be previewed here and stay in this page session.",
    metrics: [
      { label: "Active products", value: "18", hint: "Sample wall and ceiling range" },
      { label: "Featured", value: "6", hint: "Shown prominently in catalogue" },
      { label: "Draft records", value: "2", hint: "Not visible to customers" },
    ],
    columns: [
      { key: "product", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "price", label: "Price", numeric: true },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "product-1", product: "Walnut Fluted PVC Panel", sku: "WP-WAL-240", category: "Wall panel", price: "₱1,490", status: "ACTIVE" },
      { id: "product-2", product: "White Linear Ceiling Panel", sku: "CP-WHT-300", category: "Ceiling panel", price: "₱980", status: "ACTIVE" },
      { id: "product-3", product: "Stone Grey Flat Panel", sku: "WP-GRY-280", category: "Wall panel", price: "₱1,260", status: "INACTIVE" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    eyebrow: "Operations",
    title: "Inventory health",
    description: "Representative stock levels, reorder thresholds, and warehouse availability.",
    note: "Stock quantities and restock status can be adjusted in this preview session.",
    metrics: [
      { label: "Units on hand", value: "1,284", hint: "Across sample inventory" },
      { label: "Low stock", value: "3", hint: "At or below reorder point" },
      { label: "Out of stock", value: "1", hint: "Awaiting replenishment" },
    ],
    columns: [
      { key: "item", label: "Inventory item" },
      { key: "onHand", label: "On hand", numeric: true },
      { key: "reorder", label: "Reorder at", numeric: true },
      { key: "location", label: "Location", secondary: true },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "stock-1", item: "Walnut Fluted PVC Panel", sku: "WP-WAL-240", unitPrice: "1490.00", onHand: "86", reorder: "30", location: "Main warehouse", status: "HEALTHY" },
      { id: "stock-2", item: "White Linear Ceiling Panel", sku: "CP-WHT-300", unitPrice: "980.00", onHand: "12", reorder: "20", location: "Main warehouse", status: "LOW_STOCK" },
      { id: "stock-3", item: "Warm Oak Corner Trim", sku: "TR-OAK-240", unitPrice: "190.00", onHand: "0", reorder: "24", location: "Main warehouse", status: "OUT_OF_STOCK" },
    ],
  },
  {
    id: "sales",
    label: "Orders & sales",
    eyebrow: "Commerce",
    title: "Orders and fulfilment",
    description: "A representative operational view of order value, payment, and delivery status.",
    note: "Order fulfilment changes can be previewed without affecting payments or production data.",
    metrics: [
      { label: "This month", value: "₱96,420", hint: "Sample gross order value" },
      { label: "Awaiting fulfilment", value: "8", hint: "Paid and processing orders" },
      { label: "Delivered", value: "29", hint: "Sample completed orders" },
    ],
    columns: [
      { key: "order", label: "Order" },
      { key: "customer", label: "Customer" },
      { key: "project", label: "Linked project", secondary: true },
      { key: "total", label: "Total", numeric: true },
      { key: "payment", label: "Payment" },
      { key: "status", label: "Order status" },
    ],
    rows: [
      { id: "order-1", order: "PS-1046", customer: "Sample Customer A", projectId: "project-1", project: "Living room feature wall", projectStatus: "IN_PROGRESS", total: "₱18,760", payment: "Paid", status: "PROCESSING" },
      { id: "order-2", order: "PS-1045", customer: "Sample Customer B", projectId: "project-2", project: "Kitchen ceiling refresh", projectStatus: "PENDING", total: "₱32,400", payment: "Paid", status: "SHIPPED" },
      { id: "order-3", order: "PS-1044", customer: "Sample Customer C", projectId: "project-3", project: "Reception wall panels", projectStatus: "COMPLETED", total: "₱9,840", payment: "Pending", status: "PENDING" },
    ],
  },
  {
    id: "installers",
    label: "Installers",
    eyebrow: "Field operations",
    title: "Installer management",
    description: "Review installer availability and representative assignment load.",
    note: "Availability and assignment counts can be changed in this preview session.",
    metrics: [
      { label: "Active installers", value: "8", hint: "Sample field team" },
      { label: "Available today", value: "5", hint: "Representative availability" },
      { label: "Scheduled jobs", value: "11", hint: "Next seven days" },
    ],
    columns: [
      { key: "installer", label: "Installer" },
      { key: "specialty", label: "Specialty" },
      { key: "assignments", label: "Assignments", numeric: true },
      { key: "coverage", label: "Coverage", secondary: true },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "installer-1", installer: "Sample Installer One", phone: "+63 900 000 0101", verified: "true", specialty: "Wall panels", assignments: "2", coverage: "Metro area", status: "ACTIVE" },
      { id: "installer-2", installer: "Sample Installer Two", phone: "+63 900 000 0102", verified: "true", specialty: "Ceiling panels", assignments: "1", coverage: "Metro area", status: "ACTIVE" },
      { id: "installer-3", installer: "Sample Installer Three", phone: "+63 900 000 0103", verified: "true", specialty: "Wall & ceiling", assignments: "0", coverage: "Nearby provinces", status: "INACTIVE" },
    ],
  },
  {
    id: "moderators",
    label: "Moderators",
    eyebrow: "Governance",
    title: "Moderator and owner oversight",
    description: "A representative view of staff roles, access status, and assigned work.",
    note: "Role changes and account deactivation are not available in the demo.",
    metrics: [
      { label: "Owners", value: "1", hint: "Full governance access" },
      { label: "Moderators", value: "4", hint: "Operational staff accounts" },
      { label: "Pending access reviews", value: "2", hint: "Sample owner decisions" },
    ],
    columns: [
      { key: "staff", label: "Staff member" },
      { key: "role", label: "Role" },
      { key: "assigned", label: "Assigned work", numeric: true },
      { key: "lastActive", label: "Last active", secondary: true },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "staff-1", staff: "Demo Owner", role: "Owner", assigned: "—", lastActive: "Today", status: "ACTIVE" },
      { id: "staff-2", staff: "Sample Moderator One", role: "Moderator", assigned: "5 projects", lastActive: "Today", status: "ACTIVE" },
      { id: "staff-3", staff: "Sample Moderator Two", role: "Moderator", assigned: "3 projects", lastActive: "Yesterday", status: "ACTIVE" },
    ],
  },
  {
    id: "requests",
    label: "Change requests",
    eyebrow: "Governance",
    title: "Operational change requests",
    description: "Review and update change requests that support day-to-day business operations.",
    note: "Change requests submitted by moderators for owner review and decision.",
    metrics: [
      { label: "Pending", value: "3", hint: "Awaiting operational review" },
      { label: "Approved this month", value: "9", hint: "Representative decisions" },
      { label: "Rejected this month", value: "1", hint: "Representative decisions" },
    ],
    columns: [
      { key: "request", label: "Request" },
      { key: "scope", label: "Scope" },
      { key: "details", label: "Request details", secondary: true },
      { key: "submittedBy", label: "Submitted by" },
      { key: "submitted", label: "Submitted", secondary: true },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "request-1", request: "Adjust ceiling panel reorder level", scope: "Inventory", details: "Increase reorder threshold for CP-WHT-300 to 20 units to prevent stockouts.", submittedBy: "Sample Moderator One", submitted: "Today", status: "PENDING" },
      { id: "request-2", request: "Reassign installation project", scope: "Projects", details: "Reassign living room feature wall project due to installer scheduling conflict.", submittedBy: "Sample Moderator Two", submitted: "Yesterday", status: "APPROVED" },
      { id: "request-3", request: "Deactivate duplicate customer record", scope: "Accounts", details: "Archive redundant test record created during sample onboarding flow.", submittedBy: "Sample Moderator One", submitted: "Aug 24", status: "REJECTED" },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    eyebrow: "Customer projects",
    title: "Measurement and installation projects",
    description: "Representative customer projects, including future mobile-measurement records.",
    note: "Mobile AR results shown here are fictional preview data, not live scans.",
    metrics: [
      { label: "In progress", value: "12", hint: "Measurement and installation" },
      { label: "Awaiting review", value: "4", hint: "Sample staff review queue" },
      { label: "Completed", value: "27", hint: "Representative project history" },
    ],
    columns: [
      { key: "project", label: "Project" },
      { key: "customer", label: "Customer" },
      { key: "surface", label: "Surface" },
      { key: "source", label: "Measurement source", secondary: true },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "project-1", project: "Living room feature wall", customer: "Sample Customer A", surface: "Wall · 12.96 m²", source: "Mobile AR", status: "IN_PROGRESS", orderId: "order-1", orderNumber: "PS-1046", notes: "Living room feature wall panels scheduled for installation." },
      { id: "project-2", project: "Kitchen ceiling refresh", customer: "Sample Customer B", surface: "Ceiling · 18.40 m²", source: "Manual entry", status: "PENDING", orderId: "order-2", orderNumber: "PS-1045", notes: "Kitchen ceiling surface inspection pending." },
      { id: "project-3", project: "Reception wall panels", customer: "Sample Customer C", surface: "Wall · 24.10 m²", source: "Mobile AR", status: "COMPLETED", orderId: "order-3", orderNumber: "PS-1044", notes: "Reception panels completed and approved." },
    ],
  },
  {
    id: "support",
    label: "Support & feedback",
    eyebrow: "Customer care",
    title: "Conversations and feedback",
    description: "Review representative customer messages, service topics, and satisfaction signals.",
    note: "Conversation status can be updated in this preview session.",
    metrics: [
      { label: "Open conversations", value: "6", hint: "Sample support queue" },
      { label: "Awaiting reply", value: "2", hint: "Representative conversations" },
      { label: "Average rating", value: "4.7", hint: "Sample customer feedback" },
    ],
    columns: [
      { key: "subject", label: "Conversation" },
      { key: "customer", label: "Customer" },
      { key: "channel", label: "Area" },
      { key: "updated", label: "Updated", secondary: true },
      { key: "status", label: "Status" },
    ],
    rows: [
      { id: "support-1", subject: "Help estimating panel quantity", customer: "Sample Customer A", channel: "Products", updated: "12 min ago", status: "PENDING" },
      { id: "support-2", subject: "Installation schedule confirmation", customer: "Sample Customer B", channel: "Installation", updated: "1 hour ago", status: "IN_PROGRESS" },
      { id: "support-3", subject: "Delivery completed", customer: "Sample Customer C", channel: "Order", updated: "Yesterday", status: "COMPLETED" },
    ],
  },
]
