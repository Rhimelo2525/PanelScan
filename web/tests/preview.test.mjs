import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

// Exercise the actual dependency-free policies without adding a test framework.
async function sourceModule(path, dependencies = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8")
  for (const [name, url] of Object.entries(dependencies)) source = source.replaceAll(`"${name}"`, JSON.stringify(url))
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
}
const moneyUrl = await sourceModule("../src/lib/format-price.ts")
const money = await import(moneyUrl)
const reactUrl = `data:text/javascript,${encodeURIComponent("export function useSyncExternalStore(subscribe, getSnapshot) { return getSnapshot() }")}`
const capabilitiesUrl = await sourceModule("../src/admin/admin-preview-capabilities.ts")
const catalogUrl = await sourceModule("../src/data/catalog-fallback.ts")
const productPolicyUrl = await sourceModule("../src/preview/product-policy.ts", { "../lib/format-price": moneyUrl })
const ratingPolicyUrl = await sourceModule("../src/preview/rating-policy.ts")
const supportPolicyUrl = await sourceModule("../src/preview/support-policy.ts")
const customerOrdersUrl = await sourceModule("../src/data/customer-order-preview.ts", {
  "@/data/catalog-fallback": catalogUrl,
  "@/preview/rating-policy": ratingPolicyUrl,
})
const productStore = await import(await sourceModule("../src/preview/product-store.ts", {
  react: reactUrl,
  "@/admin/admin-preview-capabilities": capabilitiesUrl,
  "@/data/catalog-fallback": catalogUrl,
  "@/lib/format-price": moneyUrl,
  "@/preview/product-policy": productPolicyUrl,
}))
const supportStore = await import(await sourceModule("../src/preview/support-store.ts", {
  react: reactUrl,
  "@/preview/support-policy": supportPolicyUrl,
}))
const ratingStore = await import(await sourceModule("../src/preview/rating-store.ts", {
  react: reactUrl,
  "@/data/customer-order-preview": customerOrdersUrl,
  "@/preview/rating-policy": ratingPolicyUrl,
}))
const { fallbackCategories, fallbackProducts } = await import(catalogUrl)
const productPolicy = await import(productPolicyUrl)
const { ratingError, summarizeRatings } = await import(ratingPolicyUrl)
const adminReviewUrl = await sourceModule("../src/data/admin-review.ts")
const businessValidationUrl = await sourceModule("../src/preview/business-validation.ts", { "../lib/format-price": moneyUrl })
const businessStoreUrl = await sourceModule("../src/preview/business-store.ts", {
  react: reactUrl,
  "@/admin/admin-preview-capabilities": capabilitiesUrl,
  "@/data/admin-review": adminReviewUrl,
  "@/preview/business-validation": businessValidationUrl,
})
const businessStore = await import(businessStoreUrl)
const { validateBusinessRecord, previewStockStatus, validateProjectRecord, VALID_PROJECT_STATUSES } = await import(businessValidationUrl)
const { adminPreviewCapabilities, canViewPreviewSection } = await import(capabilitiesUrl)

const purchase = { id: "order", status: "DELIVERED", items: [{ productId: "panel" }] }
const rating = { orderId: "order", productId: "panel", stars: 5, feedback: "Sample feedback" }
for (const status of ["PENDING", "PROCESSING", "PREPARING", "SHIPPED", "IN_TRANSIT", "CANCELLED", "UNKNOWN"]) {
  test(`${status} cannot submit a rating`, () => assert.match(ratingError([{ ...purchase, status }], [], rating), /after delivery/))
}
test("delivered and completed purchases accept each 1–5 star value", () => {
  for (const status of ["DELIVERED", "COMPLETED"]) for (const stars of [1, 2, 3, 4, 5]) assert.equal(ratingError([{ ...purchase, status }], [], { ...rating, stars }), null)
})
test("rejects out-of-range, fractional and invalid star values", () => {
  for (const stars of [0, -1, 6, 2.5, NaN]) assert.match(ratingError([purchase], [], { ...rating, stars }), /1 to 5/)
})
test("ratings require an existing order and purchased product", () => {
  assert.match(ratingError([], [], rating), /not part/)
  assert.match(ratingError([purchase], [], { ...rating, productId: "other" }), /not part/)
})
test("duplicate purchase ratings are rejected, another delivered order is allowed", () => {
  assert.match(ratingError([purchase], [rating], rating), /already rated/)
  assert.equal(ratingError([{ ...purchase, id: "second" }], [rating], { ...rating, orderId: "second" }), null)
})
test("reviews have a length limit and summaries remain product-specific", () => {
  assert.match(ratingError([purchase], [], { ...rating, feedback: "x".repeat(501) }), /500/)
  const summary = summarizeRatings([rating, { ...rating, stars: 3, orderId: "second" }, { ...rating, productId: "other", stars: 1 }], "panel")
  assert.equal(summary.count, 2)
  assert.equal(summary.average, 4)
  assert.equal(summarizeRatings([], "panel").average, null)
})
test("preview capabilities keep products and support with Moderators and moderator management with Owners", () => {
  assert.equal(adminPreviewCapabilities.OWNER.manageProducts, false)
  assert.equal(adminPreviewCapabilities.OWNER.manageSupport, false)
  assert.equal(adminPreviewCapabilities.MODERATOR.manageProducts, true)
  assert.equal(adminPreviewCapabilities.MODERATOR.manageSupport, true)
  assert.equal(adminPreviewCapabilities.OWNER.manageModerators, true)
  assert.equal(adminPreviewCapabilities.MODERATOR.manageModerators, false)
  assert.equal(adminPreviewCapabilities.OWNER.manageRequests, true)
  assert.equal(adminPreviewCapabilities.MODERATOR.manageRequests, false)
  assert.equal(canViewPreviewSection("OWNER", "support"), false)
  assert.equal(canViewPreviewSection("MODERATOR", "support"), true)
  assert.equal(canViewPreviewSection("OWNER", "moderators"), true)
  assert.equal(canViewPreviewSection("MODERATOR", "moderators"), false)
  assert.equal(canViewPreviewSection("OWNER", "products"), true)
  assert.equal(canViewPreviewSection("OWNER", "requests"), true)
  assert.equal(canViewPreviewSection("MODERATOR", "requests"), true)
  assert.equal(canViewPreviewSection("OWNER", "customers"), false)
  assert.equal(canViewPreviewSection("MODERATOR", "customers"), false)
})

test("shared product store enforces role, image and catalog visibility rules", () => {
  const category = fallbackCategories[0]
  const draft = { name: "  Test Wall Panel  ", categoryId: category.id, description: " Store-backed panel ", price: "123.40", material: " PVC ", quantity: "7", status: "DRAFT" }
  assert.match(productStore.savePreviewProduct("OWNER", draft, "blob:owner").errors.form, /Only Moderators/)
  assert.match(productStore.savePreviewProduct("MODERATOR", draft, null).errors.image, /Choose an image/)

  const created = productStore.savePreviewProduct("MODERATOR", draft, "blob:first").product
  assert.ok(created)
  assert.equal(created.categoryId, category.id)
  assert.equal(created.category.slug, category.slug)
  assert.equal(created.price, "123.40")
  assert.equal(created.isActive, false)
  assert.equal(created.previewSource, "MODERATOR")
  assert.equal(productStore.usePreviewProducts().some((item) => item.id === created.id), true)
  assert.equal(productStore.selectPreviewCatalog([], { categorySlug: category.slug }, true).some((item) => item.id === created.id), false)

  const revoked = []
  const originalRevoke = URL.revokeObjectURL
  URL.revokeObjectURL = (url) => revoked.push(url)
  try {
    const active = productStore.savePreviewProduct("MODERATOR", { ...draft, status: "ACTIVE", price: "90" }, "blob:second", created.id).product
    assert.equal(active.price, "90.00")
    const bySlug = productStore.selectPreviewCatalog(fallbackProducts, { categorySlug: category.slug }, true)
    const slugOverridesApiId = productStore.selectPreviewCatalog(fallbackProducts, { categoryId: "different-api-id", categorySlug: category.slug }, true)
    const byApiId = productStore.selectPreviewCatalog(fallbackProducts, { categoryId: category.id }, true)
    assert.equal(bySlug.filter((item) => item.id === created.id).length, 1)
    assert.equal(slugOverridesApiId.some((item) => item.id === created.id), true)
    assert.equal(byApiId.filter((item) => item.id === created.id).length, 1)
    assert.equal(new Set(bySlug.map((item) => item.id)).size, bySlug.length)
    assert.deepEqual(revoked, ["blob:first"])
  } finally {
    URL.revokeObjectURL = originalRevoke
  }
})

test("editing a fallback product preserves its source and overlays it exactly once", () => {
  const existing = fallbackProducts[0]
  const draft = {
    name: `${existing.name} Updated`, categoryId: existing.categoryId, description: existing.description,
    price: existing.price, material: existing.material, quantity: String(existing.inventory.quantity), status: "ACTIVE",
  }
  const edited = productStore.savePreviewProduct("MODERATOR", draft, null, existing.id).product
  assert.equal(edited.previewSource, "EXISTING")
  assert.equal(productStore.isManagedPreviewProduct(existing.id), true)
  const overlay = productStore.selectPreviewCatalog(fallbackProducts, { categorySlug: existing.category.slug }, true)
  assert.equal(overlay.filter((item) => item.id === existing.id).length, 1)
  assert.equal(overlay.find((item) => item.id === existing.id).name, draft.name)
})

test("product policy rejects invalid catalog fields and image files", () => {
  const valid = { name: "Panel", categoryId: fallbackCategories[0].id, description: "Description", price: "90.00", material: "PVC", quantity: "1", status: "ACTIVE" }
  assert.ok(productPolicy.validateProductDraft({ ...valid, categoryId: "unknown" }, fallbackCategories.map((item) => item.id)).categoryId)
  assert.ok(productPolicy.validateProductDraft({ ...valid, price: "1.234" }, fallbackCategories.map((item) => item.id)).price)
  assert.ok(productPolicy.validateProductDraft({ ...valid, quantity: "1.5" }, fallbackCategories.map((item) => item.id)).quantity)
  assert.ok(productPolicy.validateProductDraft({ ...valid, status: "ARCHIVED" }, fallbackCategories.map((item) => item.id)).status)
  assert.match(productPolicy.imageFileError({ type: "image/gif", size: 10 }), /JPG, PNG, or WebP/)
  assert.match(productPolicy.imageFileError({ type: "image/png", size: 0 }), /smaller than 5 MB/)
  assert.match(productPolicy.imageFileError({ type: "image/png", size: 5 * 1024 * 1024 + 1 }), /smaller than 5 MB/)
  assert.equal(productPolicy.imageFileError({ type: "image/webp", size: 1024 }), null)
})

test("shared support store roundtrips messages and protects roles, ownership and statuses", () => {
  const conversationId = supportStore.getCustomerPreviewConversationId()
  assert.match(supportStore.sendPreviewSupportMessage("CUSTOMER", conversationId, "   "), /Enter a message/)
  assert.match(supportStore.sendPreviewSupportMessage("CUSTOMER", conversationId, "x".repeat(1001)), /1000/)
  assert.match(supportStore.sendPreviewSupportMessage("OWNER", conversationId, "hello"), /Owner access/)
  assert.match(supportStore.sendPreviewSupportMessage("CUSTOMER", "someone-else", "hello"), /own preview conversation/)
  assert.equal(supportStore.sendPreviewSupportMessage("CUSTOMER", conversationId, "  Need an update  "), null)
  let conversation = supportStore.usePreviewConversations().find((item) => item.id === conversationId)
  assert.equal(conversation.messages.at(-1).body, "Need an update")
  assert.equal(conversation.status, "OPEN")
  assert.equal(supportStore.sendPreviewSupportMessage("MODERATOR", conversationId, "  We are checking  "), null)
  conversation = supportStore.usePreviewConversations().find((item) => item.id === conversationId)
  assert.equal(conversation.status, "AWAITING_CUSTOMER")
  assert.equal(supportStore.updatePreviewConversationStatus("OWNER", conversationId, "RESOLVED"), "Only Moderators can update support conversation status.")
  assert.match(supportStore.updatePreviewConversationStatus("MODERATOR", conversationId, "INVALID"), /valid support conversation status/)
  assert.equal(supportStore.updatePreviewConversationStatus("MODERATOR", conversationId, "RESOLVED"), null)
  conversation = supportStore.usePreviewConversations().find((item) => item.id === conversationId)
  assert.equal(conversation.messages.at(-1).sender, "MODERATOR")
  assert.equal(conversation.status, "RESOLVED")
  assert.equal(supportStore.sendPreviewSupportMessage("CUSTOMER", conversationId, "One more question"), null)
  conversation = supportStore.usePreviewConversations().find((item) => item.id === conversationId)
  assert.equal(conversation.status, "OPEN")
})

test("shared rating store publishes a timestamped review and rejects its duplicate", () => {
  const review = { orderId: "customer-preview-order-1", productId: fallbackProducts.find((item) => item.sku === "CP-PVC-001").id, stars: 4, feedback: "  Looks great  " }
  assert.equal(ratingStore.submitPreviewRating(review), null)
  const saved = ratingStore.usePreviewRatings().find((item) => item.orderId === review.orderId && item.productId === review.productId)
  assert.equal(saved.feedback, "Looks great")
  assert.equal(Number.isNaN(Date.parse(saved.submittedAt)), false)
  assert.match(ratingStore.submitPreviewRating(review), /already rated/)
})
const stock = { id: "stock", item: "Sample panel", sku: "SKU-1", location: "Sample warehouse", onHand: "10", reorder: "5", unitPrice: "90.00" }
test("inventory accepts valid records and rejects duplicate SKUs and invalid quantities/prices", () => {
  assert.deepEqual(validateBusinessRecord("inventory", stock, []), {})
  assert.ok(validateBusinessRecord("inventory", { ...stock, sku: "sku-1", id: "new" }, [stock]).sku)
  assert.deepEqual(validateBusinessRecord("inventory", stock, [stock]), {})
  for (const onHand of ["", "-1", "1.5", "abc", "1000001"]) assert.ok(validateBusinessRecord("inventory", { ...stock, onHand }, []).onHand)
  assert.ok(validateBusinessRecord("inventory", { ...stock, unitPrice: "9.999" }, []).unitPrice)
})
test("stock status follows zero and reorder thresholds", () => {
  assert.equal(previewStockStatus(0, 10), "OUT_OF_STOCK")
  assert.equal(previewStockStatus(10, 10), "LOW_STOCK")
  assert.equal(previewStockStatus(11, 10), "HEALTHY")
})
test("installers require verification, contact information and whole job counts", () => {
  const installer = { id: "installer", installer: "Sample Installer", phone: "+63 900 000 0100", specialty: "Panels", coverage: "Sample area", assignments: "0", verified: "true", status: "ACTIVE" }
  assert.deepEqual(validateBusinessRecord("installers", installer, []), {})
  assert.ok(validateBusinessRecord("installers", { ...installer, verified: "false" }, []).verified)
  assert.ok(validateBusinessRecord("installers", { ...installer, phone: "bad" }, []).phone)
  assert.ok(validateBusinessRecord("installers", { ...installer, assignments: "-1" }, []).assignments)
})
test("peso formatting preserves numeric values and exact line totals", () => {
  assert.equal(money.formatProductPrice("90.00"), "₱90.00")
  assert.equal(money.formatMinorUnits(9000), "₱90.00")
  assert.equal(money.formatPesos(90), "₱90.00")
  assert.equal(money.formatPesos(90, true), "₱90")
  assert.equal(money.calculateLineTotal("0.10", 3), 30)
  assert.equal(money.parsePriceToMinorUnits("1.234"), null)
})

test("moderator and owner project management capabilities and access rules", () => {
  // Requirement 1: Moderator has permission to update projects
  assert.equal(adminPreviewCapabilities.MODERATOR.manageProjects, true)
  // Requirement 8: Owner functionality remains intact
  assert.equal(adminPreviewCapabilities.OWNER.manageProjects, true)
  assert.equal(adminPreviewCapabilities.OWNER.manageRequests, true)
  // Requirement 9: Moderator Change Request permissions remain restricted
  assert.equal(adminPreviewCapabilities.MODERATOR.manageRequests, false)
  // Requirement 10: Customers directory remains inaccessible
  assert.equal(canViewPreviewSection("MODERATOR", "customers"), false)
  assert.equal(canViewPreviewSection("OWNER", "customers"), false)
  // Projects and sales (orders) sections viewable
  assert.equal(canViewPreviewSection("MODERATOR", "projects"), true)
  assert.equal(canViewPreviewSection("MODERATOR", "sales"), true)
  assert.equal(canViewPreviewSection("MODERATOR", "orders"), true)
  assert.equal(canViewPreviewSection("OWNER", "projects"), true)
  assert.equal(canViewPreviewSection("OWNER", "sales"), true)
  assert.equal(canViewPreviewSection("OWNER", "orders"), true)
})

test("resolving corresponding project for orders and sales rows", () => {
  const salesRows = businessStore.getBusinessRows("sales")
  const projectRows = businessStore.getBusinessRows("projects")
  assert.ok(salesRows.length > 0)
  assert.ok(projectRows.length > 0)

  // Requirement 4: The correct project is selected from Orders & Sales entry point
  for (const order of salesRows) {
    const resolved = businessStore.resolveProjectForOrder(order, projectRows)
    assert.ok(resolved, `Project must resolve for order ${order.id}`)
    assert.equal(resolved.id, order.projectId)
    assert.equal(resolved.customer, order.customer)
  }

  // Fallback resolution matching orderId or orderNumber
  const mockOrderWithoutProjectId = { id: "order-999", order: "PS-1046", customer: "Sample Customer A" }
  const matchedByOrderNumber = businessStore.resolveProjectForOrder(mockOrderWithoutProjectId, projectRows)
  assert.equal(matchedByOrderNumber?.id, "project-1")

  // Fallback resolution by customer
  const mockOrderWithCustomerOnly = { id: "order-888", customer: "Sample Customer B" }
  const matchedByCustomer = businessStore.resolveProjectForOrder(mockOrderWithCustomerOnly, projectRows)
  assert.equal(matchedByCustomer?.id, "project-2")
})

test("project validation rules reject invalid statuses, empty surfaces, and excess lengths", () => {
  assert.deepEqual(VALID_PROJECT_STATUSES, ["PENDING", "IN_PROGRESS", "READY_FOR_REVIEW", "COMPLETED"])
  // Requirement 7: Invalid updates are rejected according to validation rules
  assert.deepEqual(validateProjectRecord({ status: "IN_PROGRESS", surface: "Wall · 15 m²", notes: "Valid notes" }), {})

  // Invalid status
  assert.ok(validateProjectRecord({ status: "NOT_A_STATUS" }).status)
  assert.ok(validateProjectRecord({ status: "" }).status)

  // Surface validation
  assert.ok(validateProjectRecord({ status: "PENDING", surface: "   " }).surface)
  assert.ok(validateProjectRecord({ status: "PENDING", surface: "x".repeat(121) }).surface)
  assert.deepEqual(validateProjectRecord({ status: "PENDING", surface: "x".repeat(120) }), {})

  // Notes validation
  assert.ok(validateProjectRecord({ status: "PENDING", surface: "Wall · 10 m²", notes: "x".repeat(501) }).notes)
  assert.deepEqual(validateProjectRecord({ status: "PENDING", surface: "Wall · 10 m²", notes: "x".repeat(500) }), {})
})

test("moderator can update project and changes synchronize across projects and sales in shared store", () => {
  // Requirement 2: Moderator can trigger Update Project from Projects
  // Requirement 3: Moderator can trigger Update Project from Orders & Sales
  // Requirement 5: Saving updates the shared project state
  // Requirement 6: Updated information appears in both relevant views
  const targetProjectId = "project-1"
  const newStatus = "READY_FOR_REVIEW"
  const newSurface = "Living Wall · 14.50 m²"
  const newNotes = "Updated surface specifications by moderator during preview"

  const updateResult = businessStore.updateProjectRecord("MODERATOR", targetProjectId, {
    status: newStatus,
    surface: newSurface,
    notes: newNotes,
  })

  assert.equal(updateResult.success, true)
  assert.equal(updateResult.project?.status, newStatus)
  assert.equal(updateResult.project?.surface, newSurface)
  assert.equal(updateResult.project?.notes, newNotes)

  // Verify reflected in projects list
  const updatedProjects = businessStore.getBusinessRows("projects")
  const projectInStore = updatedProjects.find((p) => p.id === targetProjectId)
  assert.equal(projectInStore?.status, newStatus)
  assert.equal(projectInStore?.surface, newSurface)
  assert.equal(projectInStore?.notes, newNotes)

  // Verify synchronized into linked sales/order list
  const updatedSales = businessStore.getBusinessRows("sales")
  const linkedOrder = updatedSales.find((o) => o.projectId === targetProjectId)
  assert.ok(linkedOrder)
  assert.equal(linkedOrder.projectStatus, newStatus)
  assert.equal(linkedOrder.projectSurface, newSurface)
})

test("owner can also update project and permissions are properly enforced", () => {
  // Requirement 8: Owner functionality remains intact
  const ownerResult = businessStore.updateProjectRecord("OWNER", "project-2", {
    status: "COMPLETED",
    surface: "Kitchen ceiling · 20.00 m²",
    notes: "Owner verified completion",
  })
  assert.equal(ownerResult.success, true)
  assert.equal(ownerResult.project?.status, "COMPLETED")

  const updatedProjects = businessStore.getBusinessRows("projects")
  const p2 = updatedProjects.find((p) => p.id === "project-2")
  assert.equal(p2?.status, "COMPLETED")

  const updatedSales = businessStore.getBusinessRows("sales")
  const order2 = updatedSales.find((o) => o.projectId === "project-2")
  assert.equal(order2?.projectStatus, "COMPLETED")
})
