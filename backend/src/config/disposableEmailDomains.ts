/**
 * Local adjustments to the disposable-email blocklist (see
 * utils/disposableEmail.ts). The bulk of the list comes from two maintained
 * npm packages - `mailchecker` and `disposable-email-domains-js` - and is
 * refreshed by updating them (`npm update mailchecker
 * disposable-email-domains-js`). Edit this file only for what those lists get
 * wrong; the registration logic never needs to change.
 *
 * Entries are bare, lower-case domains. A domain also covers its subdomains
 * ("mailinator.com" covers "x.mailinator.com").
 */

/** Temporary-mail domains the upstream lists do not include yet. */
export const EXTRA_DISPOSABLE_EMAIL_DOMAINS: readonly string[] = [
  'tempmail.com',
  'tempmail.lol',
  'tempmail.us.com',
  'tempmailaddress.com',
  'temp-mail.pro',
  'mailtemp.uk',
];

/**
 * Never treated as disposable, even if a future upstream update lists them.
 * Mainstream providers are here as a guard against false positives; the
 * privacy-alias services forward to a permanent inbox the customer owns
 * (Proton Pass, Firefox Relay, DuckDuckGo, SimpleLogin, addy.io), so they are
 * not temporary mail even though one upstream list includes them.
 */
export const ALLOWED_EMAIL_DOMAINS: readonly string[] = [
  // Mainstream providers
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.ph',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.com.ph',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'protonmail.ch',
  'pm.me',
  'aol.com',
  'gmx.com',
  'zoho.com',
  'zohomail.com',
  'yandex.com',
  'mail.com',
  'tutanota.com',
  'tuta.io',
  'fastmail.com',
  // Privacy aliases that forward to a permanent inbox
  'passmail.net',
  'passmail.com',
  'passinbox.com',
  'mozmail.com',
  'duck.com',
  'simplelogin.com',
  'simplelogin.co',
  'aleeas.com',
  'slmail.me',
  'addy.io',
  'anonaddy.com',
  'anonaddy.me',
  'privaterelay.appleid.com',
];
