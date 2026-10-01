import { promises as dnsPromises } from 'node:dns';

import { DISPOSABLE_MAIL_SERVER_IPS } from '../config/disposableEmailDomains';
import { env } from '../config/env';
import { AppError } from './AppError';
import { DISPOSABLE_EMAIL_MESSAGE, emailDomain, isAllowedEmailDomain, isDisposableEmail } from './disposableEmail';

/**
 * Extra screening for a NEW account's email address, on top of the local
 * disposable list (utils/disposableEmail.ts), for the domains that list
 * doesn't know:
 *
 *   1. Mail-server check (free): the domain's MX servers are a known
 *      temp-mail host (DISPOSABLE_MAIL_SERVER_IPS) or a listed disposable
 *      domain. New temp-mail domains usually share the same servers.
 *   2. Abstract Email Reputation API (ABSTRACT_EMAIL_API_KEY): flags
 *      disposable addresses, and mailboxes that don't exist.
 *
 * Mainstream providers (Gmail, Outlook, Yahoo...) skip both - they are never
 * temporary, and skipping them keeps the API credits for unknown domains.
 * Every step fails open: a DNS timeout, a missing key, an API outage or an
 * exhausted quota never blocks a sign-up; the other checks still apply.
 */

export const UNDELIVERABLE_EMAIL_MESSAGE = "We couldn't find a mailbox at this email address. Please check it and try again.";

const ABSTRACT_URL = 'https://emailreputation.abstractapi.com/v1/';
const ABSTRACT_TIMEOUT_MS = 5000;
const DNS_TIMEOUT_MS = 3000;
/** Abstract answers that mean the mailbox can't exist ("full_mailbox" / "unavailable_server" can be temporary). */
const UNDELIVERABLE_DETAILS = new Set(['invalid_mailbox', 'dns_record_not_found']);

// Reserved names (RFC 2606 / 6761) can never receive mail; tests use them.
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost']);
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);
const isReservedDomain = (domain: string): boolean => RESERVED_DOMAINS.has(domain) || RESERVED_TLDS.has(domain.split('.').at(-1) ?? '');

// Some networks' DNS servers refuse MX queries; public resolvers are the fallback.
const publicResolver = new dnsPromises.Resolver({ timeout: 1500, tries: 1 });
publicResolver.setServers(['1.1.1.1', '8.8.8.8']);

/** The network calls, swappable in tests so no real DNS or HTTP request is made. */
export const screeningDeps = {
  resolveMx: async (domain: string): Promise<{ exchange: string }[]> => {
    try {
      return await dnsPromises.resolveMx(domain);
    } catch {
      return publicResolver.resolveMx(domain);
    }
  },
  resolve4: async (host: string): Promise<string[]> => {
    try {
      return await dnsPromises.resolve4(host);
    } catch {
      return publicResolver.resolve4(host);
    }
  },
  fetch: (url: string, init?: RequestInit): Promise<Response> => fetch(url, init),
};

/** Resolves to null instead of rejecting or hanging. */
const settleWithin = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });

/** Domains Abstract has called disposable, so a repeat attempt costs no credit. Per server instance. */
const learnedDisposableDomains = new Set<string>();
const LEARNED_LIMIT = 1000;

const usesDisposableMailServer = async (domain: string): Promise<boolean> => {
  const records = await settleWithin(screeningDeps.resolveMx(domain), DNS_TIMEOUT_MS);
  if (!records?.length) return false;

  const hosts = [...new Set(records.map((record) => record.exchange.toLowerCase().replace(/\.+$/, '')).filter(Boolean))].slice(0, 5);
  if (hosts.some((host) => isDisposableEmail(`postmaster@${host}`))) return true;

  const blockedIps = new Set(DISPOSABLE_MAIL_SERVER_IPS);
  const addresses = await Promise.all(hosts.map((host) => settleWithin(screeningDeps.resolve4(host), DNS_TIMEOUT_MS)));
  return addresses.some((list) => list?.some((ip) => blockedIps.has(ip)) ?? false);
};

interface AbstractVerdict {
  disposable: boolean;
  undeliverable: boolean;
}

interface AbstractResponse {
  email_deliverability?: { status?: string; status_detail?: string };
  email_quality?: { is_disposable?: boolean };
}

const askAbstract = async (email: string): Promise<AbstractVerdict | null> => {
  const apiKey = env.ABSTRACT_EMAIL_API_KEY;
  if (!apiKey) return null;

  try {
    // The key goes in a header, not the URL, so it never ends up in a log.
    const response = await screeningDeps.fetch(`${ABSTRACT_URL}?${new URLSearchParams({ email }).toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(ABSTRACT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[email-screening] Abstract answered ${response.status}; continuing without it.`);
      return null;
    }
    const body = (await response.json()) as AbstractResponse;
    const deliverability = body.email_deliverability;
    return {
      disposable: body.email_quality?.is_disposable === true,
      undeliverable: deliverability?.status === 'undeliverable' && UNDELIVERABLE_DETAILS.has(deliverability.status_detail ?? ''),
    };
  } catch (error) {
    console.warn('[email-screening] Abstract unavailable; continuing without it:', error instanceof Error ? error.message : error);
    return null;
  }
};

/**
 * Throws a 400 when a new account must not use this address. Call it only
 * once nothing else is wrong with the sign-up (each Abstract call uses a
 * credit). `checkMailbox` also refuses addresses whose mailbox doesn't exist;
 * leave it off where the provider has already verified the address (Google).
 */
export const screenNewAccountEmail = async (email: string, { checkMailbox }: { checkMailbox: boolean }): Promise<void> => {
  const domain = emailDomain(email);
  if (!domain || isAllowedEmailDomain(domain) || isReservedDomain(domain)) return;

  if (learnedDisposableDomains.has(domain) || (await usesDisposableMailServer(domain))) {
    throw new AppError(DISPOSABLE_EMAIL_MESSAGE, 400);
  }

  const verdict = await askAbstract(email.trim().toLowerCase());
  if (verdict?.disposable) {
    if (learnedDisposableDomains.size < LEARNED_LIMIT) learnedDisposableDomains.add(domain);
    throw new AppError(DISPOSABLE_EMAIL_MESSAGE, 400);
  }
  if (checkMailbox && verdict?.undeliverable) {
    throw new AppError(UNDELIVERABLE_EMAIL_MESSAGE, 400);
  }
};
