import type { MailMessage } from '../../utils/mailer';
import { STAFF_INVITATION_TTL_HOURS, STAFF_PASSWORD_RESET_TTL_HOURS, VERIFICATION_CODE_TTL_MINUTES } from '../../utils/verificationCode';

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
  /** Defaults to the sign-in code lifetime. */
  expiry?: string;
  /** A button below the code that opens the page where it is entered. */
  action?: { label: string; url: string };
}

const buildCodeMail = ({ to, firstName, code, subject, heading, intro, ignoreNote, expiry: customExpiry, action }: CodeMailContent): MailMessage => {
  const expiry = customExpiry ?? `This code expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes and can only be used once.`;
  const warning = 'PanelScan will never ask you for this code by phone, chat, or email.';

  const text = [
    `Hi ${firstName},`,
    '',
    intro,
    '',
    `    ${code}`,
    '',
    ...(action ? [`${action.label}: ${action.url}`, ''] : []),
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
${action ? `        <p style="margin:0 0 20px;text-align:center;"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 22px;background:#2b2622;color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;">${escapeHtml(action.label)}</a></p>\n` : ''}        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5c534b;">${escapeHtml(expiry)}</p>
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

/** The owner invited `to` as staff; the link opens the page that takes the code and sets their password. */
export const buildStaffInvitationMail = (to: string, firstName: string, code: string, acceptUrl: string): MailMessage =>
  buildCodeMail({
    to,
    firstName,
    code,
    subject: "You're invited to join the PanelScan team",
    heading: 'Activate your PanelScan staff account',
    intro: 'The PanelScan owner has invited you to join as a moderator. Open the link below (or go to the activation page and enter this code) to verify your email address and choose your password:',
    ignoreNote: "If you weren't expecting this invitation, you can safely ignore this email - no account is activated without this code.",
    expiry: `This code expires in ${STAFF_INVITATION_TTL_HOURS} hours and can only be used once.`,
    action: { label: 'Activate my account', url: acceptUrl },
  });

/** The owner started a password reset for a staff member; the link opens the page that takes the code and the new password. */
export const buildStaffPasswordResetMail = (to: string, firstName: string, code: string, resetUrl: string): MailMessage =>
  buildCodeMail({
    to,
    firstName,
    code,
    subject: 'Reset your PanelScan staff password',
    heading: 'Choose a new password',
    intro: 'The PanelScan owner sent you a password reset for your staff account. Open the link below (or go to the reset page and enter this code) to choose a new password:',
    ignoreNote: "If you didn't ask the owner for this, you can ignore this email - your current password keeps working until the code is used.",
    expiry: `This code expires in ${STAFF_PASSWORD_RESET_TTL_HOURS} hours and can only be used once. Setting a new password signs you out on every device.`,
    action: { label: 'Reset my password', url: resetUrl },
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
