# Roles and permissions

`OWNER`, `MODERATOR`, and `CUSTOMER` are the role names. “Owner/Admin” means OWNER, not a fourth role. Public preview roles are fixed demonstration modes, not authentication accounts.

## Preview capability matrix

Authority: `web/src/admin/admin-preview-capabilities.ts` and the rendered preview components. “Yes” means a local demonstration only.

| Capability | Customer view | Moderator | Owner/Admin |
| --- | --- | --- | --- |
| Browse public products | Yes | Yes | Yes |
| View management Products | No | Yes | Yes, read-only |
| Create/edit products and local images | No | Yes | No |
| Add/edit/delete inventory and installers | No | Yes | Yes |
| Update orders and linked projects | No | Yes | Yes |
| Customer support messages | Own sample conversation | Replies/status | No Support workspace |
| Submit eligible product reviews | Yes | No | No |
| View public preview rating summaries | Yes | Yes | Yes |
| View Support & Feedback review list | No | Yes | No |
| View sample Change Request statuses | No | Yes | Yes |
| Submit a new Change Request | No | Not implemented in preview | No |
| Review/approve/reject Change Requests | No | No | Yes, status only |
| Add/view/disable/remove moderator rows | No | No | Yes |
| Edit moderator permissions | No | No | Informational notice only |
| Customers account-directory tab | No | No | No |

`canViewPreviewSection` denies Customers for both staff roles, Moderators management for MODERATOR, and Support for OWNER, including direct query navigation. `view=orders` aliases `sales`.

## Business-rule cross-check

Owner operational access, read-only Products, moderator-row management, and request decisions are present. Moderator business/product/support capabilities and the prohibition on approvals/moderator creation are present. Both previews omit the Customers directory.

Two distinctions must not be hidden:

- Moderator preview shows submitted-request status text but has no compose/submit control. It shows shared sample rows from multiple fictional submitters, not authenticated “my requests” filtering.
- Owner moderator creation creates only a component-local row, not an account. Rows reset when leaving the section. Existing “Edit permissions” opens a toast; permissions are fixed.

Review decisions update only request status and do not execute restocking, account changes, or other requested actions. Preview decisions can be changed again; this is not the API workflow's final-decision model.

## Separate authenticated Admin interface

`admin/admin-nav.ts`, `admin/admin-route.tsx`, and `pages/admin/` use authenticated state and API adapters, not the preview matrix:

| Area | Implemented interface difference |
| --- | --- |
| Requests | `/admin/requests`: Moderator compose/submit; Owner approve/reject pending requests with optional notes. Requires API. |
| Team | Owner navigation exposes `/admin/team` with staff/customer filtering and account restriction; no moderator-creation form. Thus customer accounts remain visible here despite removal from previews. |
| Installers | Navigation is Moderator-only, unlike both-role installer previews. |
| Support/feedback | Navigation includes both staff roles, unlike Owner preview's absent Support workspace. |
| Products | No dedicated authenticated `/admin/products` route is defined. |

Navigation is not a claim of per-endpoint access or deployed backend behavior. Customer cart/services use CustomerRoute; dashboard uses ProtectedRoute; AdminRoute admits staff roles. Public previews bypass those authenticated routes intentionally. Do not present these UI distinctions as production authorization guarantees.
