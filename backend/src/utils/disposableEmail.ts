import { domainToASCII } from 'node:url';

import { disposableEmailBlocklist } from 'disposable-email-domains-js';
import MailChecker from 'mailchecker';

import { ALLOWED_EMAIL_DOMAINS, EXTRA_DISPOSABLE_EMAIL_DOMAINS } from '../config/disposableEmailDomains';

/** Shown for a rejected address. Says nothing about how the check works. */
export const DISPOSABLE_EMAIL_MESSAGE =
  'Temporary or disposable email addresses are not supported. Please use a permanent email address.';

let blocked: Set<string> | null = null;
let allowed: Set<string> | null = null;

/**
 * Built once, on first use: the union of two independently maintained lists
 * (~60k domains) plus the local additions in config/disposableEmailDomains.ts.
 */
const lists = (): { blocked: Set<string>; allowed: Set<string> } => {
  blocked ??= new Set([...MailChecker.blacklist(), ...disposableEmailBlocklist(), ...EXTRA_DISPOSABLE_EMAIL_DOMAINS]);
  allowed ??= new Set(ALLOWED_EMAIL_DOMAINS);
  return { blocked, allowed };
};

/**
 * The domain of an email address in the form the lists use: trimmed,
 * lower-cased, without a trailing dot, and with an internationalised name
 * converted to its ASCII (punycode) form, so look-alike Unicode spellings
 * cannot slip past. Null when there is no usable domain.
 */
export const emailDomain = (email: string): string | null => {
  const address = email.trim();
  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) return null;

  const domain = domainToASCII(address.slice(at + 1).toLowerCase().replace(/\.+$/, ''));
  return domain && domain.includes('.') ? domain : null;
};

/**
 * True when the address belongs to a temporary/disposable mail service. The
 * domain and each parent domain are checked, most specific first, so a
 * subdomain ("x.mailinator.com") is caught and an allow-listed domain always
 * wins over the blocklist.
 */
export const isDisposableEmail = (email: string): boolean => {
  const domain = emailDomain(email);
  if (!domain) return false;

  const { blocked: blockedDomains, allowed: allowedDomains } = lists();
  const labels = domain.split('.');
  for (let index = 0; index < labels.length - 1; index += 1) {
    const candidate = labels.slice(index).join('.');
    if (allowedDomains.has(candidate)) return false;
    if (blockedDomains.has(candidate)) return true;
  }
  return false;
};
