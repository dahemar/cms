# Authentication Setup Guide

This guide explains how to configure the authentication features: email verification, password reset, and Google OAuth.

## Email Configuration

The CMS uses `nodemailer` to send emails. You need to configure one of the following options:

### Option 1: SMTP (Recommended for production)

Add these variables to your `.env` file:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false  # true for port 465, false for other ports
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
EMAIL_FROM=noreply@example.com
FRONTEND_URL=http://localhost:8000  # URL of your frontend (for email links)
```

### Option 2: Gmail OAuth2

For Gmail, you can use OAuth2 instead of app passwords:

```env
GMAIL_USER=your-email@gmail.com
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
EMAIL_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:8000
```

### Option 3: Development (No real emails)

In development mode, if no email configuration is provided, the system will use a test account. Emails won't actually be sent, but the system will log attempts.

## Google OAuth Setup

To enable Google OAuth login:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure the OAuth consent screen
6. Add authorized redirect URIs:
   - Development: `http://localhost:3000/auth/google/callback`
   - Production: `https://yourdomain.com/auth/google/callback`

Add these variables to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
FRONTEND_URL=http://localhost:8000  # Where to redirect after successful login
```

## Features

### Email Verification

- When a user registers, they receive a verification email
- The email contains a link that expires in 24 hours
- Users can request a new verification email if needed
- Users must verify their email before logging in (optional, can be disabled in code)

### Password Reset

- Users can request a password reset via the "Forgot password?" link
- A reset link is sent to their email
- The link expires in 1 hour
- Each token can only be used once

### Google OAuth

- Users can sign in with their Google account
- First-time users are automatically created
- Google-verified emails are automatically marked as verified
- Users with Google accounts don't need passwords

## API Endpoints

### Authentication

- `POST /auth/register` - Register new user (sends verification email)
- `POST /auth/login` - Login (requires verified email)
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user info
- `GET /auth/verify-email?token=...` - Verify email with token
- `POST /auth/resend-verification` - Resend verification email (requires auth)
- `POST /auth/forgot-password` - Request password reset
- `POST /auth/reset-password` - Reset password with token

### Google OAuth

- `GET /auth/google` - Initiate Google OAuth login
- `GET /auth/google/callback` - Google OAuth callback (handled automatically)

## Frontend Integration

The login page (`admin/login.html`) includes:

- Email/password login form
- Registration form
- "Forgot password?" link
- Google OAuth button (shown only if configured)
- Email verification messages
- Resend verification email links

## Testing

### Test Email Verification

1. Register a new account
2. Check the console logs for the verification token (in development)
3. Visit: `http://localhost:8000/verify-email?token=YOUR_TOKEN`
4. Or use the API: `GET /auth/verify-email?token=YOUR_TOKEN`

### Test Password Reset

1. Click "Forgot password?" on the login page
2. Enter your email
3. Check console logs for the reset token (in development)
4. Use the API: `POST /auth/reset-password` with `{ token, password }`

### Test Google OAuth

1. Configure Google OAuth credentials
2. Click "Sign in with Google" on the login page
3. Complete the Google authentication flow
4. You'll be redirected back to the admin panel

## Security Notes

- Email verification tokens expire after 24 hours
- Password reset tokens expire after 1 hour
- Tokens are single-use (deleted after use)
- Passwords are hashed with bcrypt (10 rounds)
- Session cookies are httpOnly and secure in production
- OAuth users don't have passwords stored

## Troubleshooting

### Emails not sending

- Check your SMTP/Gmail credentials
- Check firewall/network settings
- In development, check console logs for email errors
- Verify `EMAIL_FROM` is set correctly

### Google OAuth not working

- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check that redirect URI matches exactly in Google Console
- Ensure Google+ API is enabled
- Check browser console for OAuth errors

### Verification emails not received

- Check spam folder
- Verify email configuration
- Check console logs for errors
- Use the "Resend verification email" option

