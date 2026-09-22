import type { MailMessage } from '../../utils/mailer';
import { VERIFICATION_CODE_TTL_MINUTES } from '../../utils/verificationCode';

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

interface CodeMailContent {
  to: string;
  firstName: string;
  code: string;
  subject: string;
  heading: string;
  intro: string;
  ignoreNote: string;
}

const buildCodeMail = ({ to, firstName, code, subject, heading, intro, ignoreNote }: CodeMailContent): MailMessage => {
  const expiry = `This code expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes and can only be used once.`;
  const warning = 'PanelScan will never ask you for this code by phone, chat, or email.';

  const text = [
    `Hi ${firstName},`,
    '',
    intro,
    '',
    `    ${code}`,
    '',
    expiry,
    ignoreNote,
    warning,
    '',
    '- PanelScan by Disenyo Interior Solution',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f1ec;font-family:Arial,Helvetica,sans-serif;color:#2b2622;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7f75;">PanelScan account</p>
        <h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>
        <p style="margin:0 0 20px;padding:16px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:0.4em;background:#f5f1ec;border-radius:8px;">${escapeHtml(code)}</p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5c534b;">${escapeHtml(expiry)}</p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5c534b;">${escapeHtml(ignoreNote)}</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#5c534b;">${escapeHtml(warning)}</p>
      </td></tr>
    </table>
    <p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#8a7f75;text-align:center;">PanelScan by Disenyo Interior Solution</p>
  </body>
</html>`;

  return { to, subject, text, html };
};

export const buildEmailVerificationMail = (to: string, firstName: string, code: string): MailMessage =>
  buildCodeMail({
    to,
    firstName,
    code,
    subject: 'Verify your PanelScan email address',
    heading: 'Verify your email address',
    intro: 'Use this code to confirm that this email address belongs to you:',
    ignoreNote: "If you didn't create a PanelScan account, you can safely ignore this email.",
  });

export const buildPasswordResetMail = (to: string, firstName: string, code: string): MailMessage =>
  buildCodeMail({
    to,
    firstName,
    code,
    subject: 'Your PanelScan password reset code',
    heading: 'Reset your password',
    intro: 'Use this code to reset the password on your PanelScan account:',
    ignoreNote: "If you didn't request a password reset, you can safely ignore this email - your password has not changed.",
  });
