import axios from 'axios';

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'fidelclinton4@gmail.com';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'GradeVault';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://grade-tracker-pq0y.onrender.com';

export async function sendResetEmail(toEmail, token) {
  const resetLink = `${APP_BASE_URL}/reset-password?token=${token}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f1117;color:#f0f0f0;border-radius:12px;padding:2rem">
      <h2 style="color:#f5c518;margin-bottom:0.5rem">Password Reset</h2>
      <p style="color:#aaa;margin-bottom:1.5rem">You requested a password reset for your GradeVault account.</p>
      <a href="${resetLink}" style="display:inline-block;background:#f5c518;color:#0f1117;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:1rem">Reset My Password</a>
      <p style="color:#666;font-size:0.8rem;margin-top:1.5rem">This link expires in <strong style="color:#aaa">30 minutes</strong>. If you didn't request this, ignore this email.</p>
      <p style="color:#888;font-size:0.75rem;margin-top:0.5rem">Or copy this link: ${resetLink}</p>
      <p style="color:#444;font-size:0.75rem;margin-top:1rem">— GradeVault System</p>
    </div>
  `;

  const payload = {
    sender: { name: MAIL_FROM_NAME, email: MAIL_FROM },
    to: [{ email: toEmail }],
    subject: 'GradeVault — Password Reset Request',
    htmlContent: html,
    textContent: `Reset your GradeVault password: ${resetLink}\n\nExpires in 30 minutes.`
  };

  try {
    const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      timeout: 20000
    });

    console.log(`[EMAIL] Email sent successfully to ${toEmail}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR] Brevo API error: ${error.response?.status} ${error.response?.data || error.message}`);
    throw new Error(`Email failed: ${error.message}`);
  }
}
