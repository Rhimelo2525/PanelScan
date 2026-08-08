# features/delivery

Shipment tracking UI, built on `api/delivery.api.ts`. CUSTOMER has read-only
access to deliveries for their own orders; only MODERATOR can
create/update/mark-delivered/delete; OWNER has read-only oversight.
