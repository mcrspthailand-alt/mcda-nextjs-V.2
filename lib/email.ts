import nodemailer from 'nodemailer';

function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || '587');

  if (!host || !user || !password || !Number.isFinite(port)) {
    throw new Error('SMTP configuration is incomplete');
  }

  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass: password },
  });
}

export async function sendRegistrationOtp(email: string, otp: string) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) throw new Error('SMTP_FROM or SMTP_USER must be configured');

  await getTransport().sendMail({
    from,
    to: email,
    subject: 'รหัส OTP สำหรับลงทะเบียน MCDA Decision Analysis',
    text: `รหัส OTP ของคุณคือ ${otp} รหัสนี้มีอายุ 10 นาที หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาเพิกเฉยต่ออีเมลนี้`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111827">
        <h2 style="margin:0 0 16px">MCDA Decision Analysis</h2>
        <p>ใช้รหัส OTP ด้านล่างเพื่อยืนยันการลงทะเบียน</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 20px;background:#f3f4f6;border-radius:12px;text-align:center">${otp}</div>
        <p style="margin-top:16px">รหัสนี้มีอายุ <strong>10 นาที</strong></p>
        <p style="color:#6b7280;font-size:13px">หากคุณไม่ได้เป็นผู้ร้องขอ กรุณาเพิกเฉยต่ออีเมลนี้</p>
      </div>
    `,
  });
}
