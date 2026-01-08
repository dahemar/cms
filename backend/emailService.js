const nodemailer = require("nodemailer");

// Configurar transporter de nodemailer
// En desarrollo, puedes usar servicios como Mailtrap, Gmail, o SendGrid
const createTransporter = () => {
  // Si hay configuración SMTP en .env, usarla
  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true", // true para 465, false para otros puertos
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Si hay configuración de Gmail OAuth2
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.GMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    });
  }

  // En desarrollo, usar un transporter de prueba (no envía emails reales)
  // Para ver los emails, usar Mailtrap o similar
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "⚠️  Email service not configured. Using test account. Emails will not be sent."
    );
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: {
        user: "test@ethereal.email",
        pass: "test",
      },
    });
  }

  // En producción sin configuración, lanzar error
  throw new Error(
    "Email service not configured. Please set SMTP or Gmail OAuth2 credentials in .env"
  );
};

// Función para enviar email de verificación
async function sendVerificationEmail(email, token, baseUrl = "http://localhost:8000") {
  const transporter = createTransporter();
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || "noreply@cms.local",
    to: email,
    subject: "Verify your email address",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .button:hover { background-color: #333; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Verify your email address</h1>
            <p>Thank you for registering! Please click the button below to verify your email address:</p>
            <a href="${verificationUrl}" class="button">Verify Email</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${verificationUrl}">${verificationUrl}</a></p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, please ignore this email.</p>
          </div>
        </body>
      </html>
    `,
    text: `Verify your email address by visiting: ${verificationUrl}`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Verification email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email] Failed to send verification email to ${email}:`, error);
    throw error;
  }
}

// Función para enviar email de reset de contraseña
async function sendPasswordResetEmail(email, token, baseUrl = "http://localhost:8000") {
  const transporter = createTransporter();
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || "noreply@cms.local",
    to: email,
    subject: "Reset your password",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .button:hover { background-color: #333; }
            .warning { color: #d32f2f; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Reset your password</h1>
            <p>You requested to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p class="warning">This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
          </div>
        </body>
      </html>
    `,
    text: `Reset your password by visiting: ${resetUrl}`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Password reset email sent to ${email}:`, info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email] Failed to send password reset email to ${email}:`, error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
};

