import type { Prisma } from '@prisma/client';

// ================================================================
// PayMongo API shapes (Checkout Sessions)
// ================================================================
// NOTE: modeled on PayMongo's public Checkout Sessions API and its
// documented webhook signing scheme (timestamp + HMAC-SHA256 over
// "{timestamp}.{raw_body}", sent via a `Paymongo-Signature` header).
// PayMongo can version/rename fields over time and this integration was
// built without live access to their current docs - verify the exact
// request/response/webhook shapes against https://developers.paymongo.com
// (or a real test webhook event from their dashboard) before relying on
// this in production. The verification and correlation logic is isolated
// in payment.service.ts specifically so it's a small, single place to fix
// if any field name has since changed.

export interface PaymongoLineItem {
  currency: string;
  /** Smallest currency unit - centavos for PHP (e.g. 10000 = PHP 100.00). */
  amount: number;
  description: string;
  name: string;
  quantity: number;
}

export interface PaymongoCheckoutSessionAttributes {
  billing?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  send_email_receipt: boolean;
  show_description: boolean;
  show_line_items: boolean;
  cancel_url: string;
  success_url: string;
  description: string;
  /** Our own correlation id (set to the internal Order id) so incoming
   *  webhook events can be matched back to the right Order/Payment without
   *  depending on PayMongo's own internal id scheme. */
  reference_number: string;
  line_items: PaymongoLineItem[];
  payment_method_types: string[];
}

export interface PaymongoCheckoutSessionRequest {
  data: {
    attributes: PaymongoCheckoutSessionAttributes;
  };
}

export interface PaymongoCheckoutSessionResponseData {
  id: string;
  type: string;
  attributes: {
    checkout_url: string;
    status: string;
    reference_number?: string;
    [key: string]: unknown;
  };
}

export interface PaymongoCheckoutSessionResponse {
  data: PaymongoCheckoutSessionResponseData;
}

export interface PaymongoErrorResponse {
  errors?: Array<{ code?: string; detail: string; [key: string]: unknown }>;
}

export interface PaymongoWebhookEvent {
  data: {
    id: string;
    type: string;
    attributes: {
      /** e.g. "payment.paid" */
      type: string;
      livemode: boolean;
      data: {
        id: string;
        type: string;
        attributes?: Record<string, unknown>;
      };
    };
  };
}

// ================================================================
// Domain types
// ================================================================

export const paymentInclude = {
  order: {
    select: { id: true, orderNumber: true, customerId: true, status: true, totalAmount: true },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentWithOrder = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

export interface PaymentFilters {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedPayments {
  payments: PaymentWithOrder[];
  pagination: PaginationMeta;
}

export interface CreatePaymentResult {
  payment: PaymentWithOrder;
  checkoutUrl: string;
}
