import type { MailMessage } from '../../src/utils/mailer';

/**
 * In-memory stand-in for the SMTP mailer, so tests can read the one-time code
 * that would have been emailed. A test file wires it in with:
 *
 *   import { mailbox } from '../helpers/mailbox';
 *   vi.mock('../../src/utils/mailer', () => ({
 *     sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
 *   }));
 *
 * (`mailbox` is only touched when sendMail is called, i.e. after imports have
 * resolved, which is why referencing it from the hoisted factory is safe.)
 */
export const mailbox = {
  messages: [] as MailMessage[],
  /** While true, every send fails, as if the SMTP server were unreachable. */
  failing: false,

  send: async (message: MailMessage): Promise<void> => {
    if (mailbox.failing) throw new Error('SMTP unavailable');
    mailbox.messages.push(message);
  },

  reset: (): void => {
    mailbox.messages.length = 0;
    mailbox.failing = false;
  },

  to: (email: string): MailMessage[] => mailbox.messages.filter((message) => message.to === email),

  /** The 6-digit code in the most recent email sent to `email`. */
  lastCodeFor: (email: string): string => {
    const message = mailbox.to(email).at(-1);
    const code = message?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`No verification code was emailed to ${email}.`);
    return code;
  },
};
