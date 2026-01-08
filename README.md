# Headless CMS - Multi-Site Architecture

A headless CMS system that supports multiple frontends from a single backend.

## Project Structure

```
cms/
├── backend/           # CMS Backend (Express + Prisma + PostgreSQL)
│   ├── index.js       # Main server file
│   ├── prisma/        # Database schema and migrations
│   ├── profiles/       # Frontend profile definitions (JSON)
│   └── seed.js        # Database seeding script
│
├── admin/             # Admin Panel (shared across all sites)
│   ├── admin.html     # Main admin interface
│   ├── login.html     # Login page
│   └── server.js      # HTTP server for admin (port 8000)
│
└── sites/             # Frontends for each site
    └── default/       # Default site frontend
        ├── index.html # Public frontend
        └── server.js  # HTTP server for site (port 8001)
```

## Quick Start

### Local Development

#### Option 1: Start all servers at once (Recommended)

```bash
./start-servers.sh
```

This will start:
- Backend API on `http://localhost:3000`
- Admin panel on `http://localhost:8000`
- Site frontend on `http://localhost:8001`

#### Option 2: Start servers individually

##### 1. Backend Setup

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
node seed.js
node index.js
```

Backend runs on `http://localhost:3000`

##### 2. Admin Panel

In a new terminal:
```bash
cd admin
node server.js
```

Admin panel accessible at:
- Login: `http://localhost:8000/login.html`
- Admin: `http://localhost:8000/admin.html`

##### 3. Site Frontend

In another terminal:
```bash
cd sites/default
node server.js
```

Site frontend accessible at:
- `http://localhost:8001/index.html`

## Deployment

### Vercel Deployment

This project is configured for deployment on Vercel:

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Connect to Vercel**:
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will automatically detect the configuration from `vercel.json`

3. **Environment Variables**:
   Set the following in Vercel Dashboard → Settings → Environment Variables:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `SESSION_SECRET`: A random secret string for sessions
   - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`: Email configuration
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`: Google OAuth (optional)
   - `API_URL`: Your Vercel deployment URL
   - `FRONTEND_URL`: Your frontend URL(s) for CORS

4. **Database Setup**:
   ```bash
   # Run migrations on your production database
   npx prisma migrate deploy
   # Or use Prisma Studio to manage your database
   npx prisma studio
   ```

5. **Deploy**:
   Vercel will automatically deploy on every push to your main branch.

### Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Random secret for session encryption
- `EMAIL_*`: Email service configuration
- `API_URL`: Backend API URL
- `FRONTEND_URL`: Frontend URL(s) for CORS

## Architecture

### Multi-Site System

- **Backend**: Single Express server that handles all sites
- **Admin Panel**: Shared admin interface accessible at `/admin`
- **Frontends**: Each site has its own frontend in `sites/{site-slug}/`

### Frontend Profiles

The CMS uses a **Frontend Profile** system that defines:
- Available section schemas
- Block types allowed for each schema
- Default templates for new posts

Profiles are stored as JSON files in `backend/profiles/` and are read-only. Each site can be assigned a profile, which determines what content structures are available.

### Site Management

- Each site has a unique `siteId` and `slug`
- Users can be assigned to one or multiple sites
- Admins can access all sites
- Regular users can only access their assigned site(s)

## Configuration

### Site ID in Frontend

Each site frontend needs to know its `siteId`. Currently, it's hardcoded in `sites/default/index.html`:

```javascript
const SITE_ID = 1; // Default site ID
```

In production, this should be:
- Loaded from a config file
- Set via environment variable
- Detected from the domain/subdomain

## Adding New Sites

1. Create a new folder in `sites/` with the site slug
2. Copy `sites/default/index.html` as a template
3. Update `SITE_ID` in the frontend to match the site's ID
4. Create a `server.js` for the site (use a different port)
5. The site will automatically appear in the admin panel for authorized users

## Database Schema

- **Site**: Represents a frontend site
- **User**: CMS users (can be admin or regular)
- **UserSite**: Junction table for user-site permissions
- **Post**: Content posts (belongs to a site)
- **Section**: Content sections (belongs to a site)
- **Category/Tag**: Content organization (belongs to a site)
- **FrontendProfile**: Profile definitions for frontend schemas

## Troubleshooting

### Port already in use

If you get "port already in use" errors:

```bash
# Kill processes on specific ports
lsof -ti:8000 | xargs kill -9
lsof -ti:8001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### 404 errors

Make sure you're running the servers from the correct directories:
- Admin server: run from `admin/` directory
- Site server: run from `sites/default/` directory
- Backend: run from `backend/` directory

### Connection refused

Make sure all servers are running:
1. Backend must be running on port 3000
2. Admin server must be running on port 8000
3. Site server must be running on port 8001

## Documentation

- `GUIA_INTEGRACION_FRONTENDPROFILES.md`: Guide for integrating frontend profiles
- `GUIA_PROCESO_CONEXION_FRONTEND_EXISTENTE.md`: Guide for connecting existing frontends
- `backend/PRODUCTION.md`: Production deployment guide
- `backend/AUTH_SETUP.md`: Authentication setup guide

## Notes

- The admin panel and site frontends are separate applications
- Each site frontend can have its own design and structure
- All sites share the same backend API
- Site-specific data is isolated by `siteId`
- Frontend profiles define the content structure available to each site
