# features/orders

Checkout + order history/tracking UI, built on `api/orders.api.ts`. Role-scoped:
CUSTOMER sees only their own orders, MODERATOR/OWNER see every order, from the
same `GET /api/orders` endpoint.
