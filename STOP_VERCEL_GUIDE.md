# How to Stop Vercel Backend Deployment

## Option 1: Delete Project from Vercel Dashboard (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Find your backend project
3. Click on the project name
4. Go to **Settings** → **General**
5. Scroll down to **Delete Project** section
6. Click **Delete** button
7. Confirm deletion

✅ This will:
- Delete all deployments
- Stop all running instances
- Remove project from dashboard
- Free up resources

## Option 2: Using Vercel CLI

### Install Vercel CLI (if not installed)
```bash
npm install -g vercel
```

### List your projects
```bash
vercel ls
```

### Remove specific project
```bash
vercel remove <project-name> --yes
```

Example:
```bash
vercel remove webstory-backend --yes
```

## Option 3: Disable Deployment (Keep Project)

### Rename vercel.json
```bash
cd backend
mv vercel.json vercel.json.disabled
```

This prevents new deployments while keeping the project in Vercel.

## Option 4: Pause via Environment Variable

1. Go to Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Add: `DISABLE_API=true`
4. Save and redeploy

Then in your code, check:
```javascript
if (process.env.DISABLE_API === 'true') {
  res.status(503).json({ error: 'API temporarily disabled' });
  return;
}
```

## Option 5: Delete Specific Deployments

```bash
# List all deployments
vercel ls

# Delete specific deployment by URL
vercel rm <deployment-url> --yes
```

## Quick Commands

```bash
# Stop Vercel backend (interactive)
cd backend && chmod +x stop-vercel.sh && ./stop-vercel.sh

# Or direct commands:
vercel ls                              # List projects
vercel rm <project-name> --yes         # Remove project
vercel inspect <deployment-url>        # Check deployment details
```

## Verify Backend is Stopped

After deletion, check:
- Vercel Dashboard should not show the project
- Backend URL should return 404
- No billing charges for that project

## Important Notes

⚠️ **Before Stopping:**
- Make sure frontend is not pointing to Vercel backend URL
- Update frontend API endpoint to localhost:3001 for local development
- Backup any environment variables from Vercel Dashboard

✅ **After Stopping:**
- Run backend locally: `cd backend && node server.js`
- Update frontend `.env`: `REACT_APP_API_URL=http://localhost:3001`
- Clear browser cache

## Current Setup

Your system is now designed to run locally with:
- **Backend**: `node server.js` (port 3001)
- **Frontend**: `npm start` (port 3000)
- **Database**: MongoDB Atlas (cloud)
- **Cache**: Redis (local or cloud)

No need for Vercel deployment as the system works better locally with:
- Section Rotation Worker (fetches + generates commentary)
- Real-time updates
- Direct database access
- No serverless cold starts
