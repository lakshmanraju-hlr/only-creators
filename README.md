# Only Creators — Full-Stack Creator Platform

A real social platform with auth, database, file storage, and real-time features.

**Stack:** React 18 · TypeScript · Vite · Supabase (PostgreSQL + Auth + Storage) · Vercel

---

## 🚀 DEPLOYMENT GUIDE (Free, end-to-end)

### STEP 1 — Set up Supabase (your backend + database)

1. Go to **https://supabase.com** and click "Start your project"
2. Sign up with GitHub (free)
3. Click **"New project"** → choose a name like `only-creators` → set a strong database password → choose the region closest to you → click **Create project** (takes ~2 minutes)
4. Once ready, go to the **SQL Editor** (left sidebar)
5. Click **"New query"**
6. Open the file `supabase-schema.sql` from this project, copy the entire contents, paste it into the SQL editor, and click **Run**
7. You should see "Success. No rows returned" — your database is set up

### STEP 2 — Get your Supabase credentials

1. In your Supabase project, go to **Settings → API** (left sidebar)
2. Copy these two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)
3. Keep this tab open — you'll need these in Step 4 and Step 5

### STEP 3 — Push code to GitHub

1. Go to **https://github.com** and sign in (or create a free account)
2. Click the **+** icon → **New repository**
3. Name it `only-creators`, set to **Public**, click **Create repository**
4. On your computer, open a terminal in this project folder and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/only-creators.git
   git push -u origin main
   ```
   (Replace `YOUR_USERNAME` with your GitHub username)

### STEP 4 — Deploy to Vercel (your frontend host)

1. Go to **https://vercel.com** and sign up with GitHub (free)
2. Click **"Add New… → Project"**
3. Find and click **Import** next to your `only-creators` repository
4. In the configuration screen:
   - Framework Preset: **Vite** (auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Click **"Environment Variables"** and add these two:
   - Name: `VITE_SUPABASE_URL` → Value: your Project URL from Step 2
   - Name: `VITE_SUPABASE_ANON_KEY` → Value: your anon public key from Step 2
6. Click **Deploy** — takes about 60 seconds
7. Vercel gives you a live URL like `https://only-creators-abc123.vercel.app`

### STEP 5 — Configure Supabase Auth (allow your domain)

1. Go back to your Supabase project
2. Go to **Authentication → URL Configuration**
3. Set **Site URL** to your Vercel URL (e.g. `https://only-creators-abc123.vercel.app`)
4. Under **Redirect URLs**, add: `https://only-creators-abc123.vercel.app/**`
5. Click **Save**

### STEP 6 — Send to friends!

Share your Vercel URL with friends. They visit the link, click "Create account", sign up, and they're in.

**That's it — your app is live!** 🎉

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Create your local env file
cp .env.example .env.local
# Then edit .env.local and paste your Supabase URL and anon key

# 3. Start dev server
npm run dev

# App runs at http://localhost:5173
```

---

## Project Structure

```
only-creators/
├── src/
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client + TypeScript types
│   │   └── AuthContext.tsx    # Global auth state
│   ├── pages/
│   │   ├── AuthPage.tsx       # Login + signup
│   │   ├── FeedPage.tsx       # Main feed with real-time updates
│   │   ├── ExplorePage.tsx    # Browse by discipline
│   │   ├── ProfilePage.tsx    # User profiles + edit
│   │   └── NotificationsPage.tsx
│   ├── components/
│   │   ├── AppShell.tsx       # Layout: sidebar + topbar + routing
│   │   ├── PostCard.tsx       # Post with like/comment/pro-upvote
│   │   ├── UploadModal.tsx    # Multi-type content upload
│   │   └── RightPanel.tsx     # Trending + suggested creators
│   ├── App.tsx                # Route guard (auth → app)
│   ├── main.tsx               # React entry point
│   └── index.css              # Full design system
├── supabase-schema.sql        # ← Run this in Supabase SQL Editor
├── vercel.json                # SPA routing fix
├── .env.example               # Copy to .env.local
└── package.json
```

---

## Free Tier Limits

| Service  | Free limit | Notes |
|----------|-----------|-------|
| Supabase | 500MB DB · 1GB storage · 50k MAU | Plenty for early users |
| Vercel   | 100GB bandwidth · unlimited deploys | More than enough |
| Total    | **$0/month** | No credit card needed |

---

## Scaling Up (when you need it)

When you outgrow the free tier:

- **Supabase Pro** — $25/month — 8GB DB, 100GB storage, no pausing
- **Vercel Pro** — $20/month — more bandwidth, team features
- Add **Redis** (Upstash, free tier) for caching hot feed data
- Add **Cloudflare** in front for global CDN and DDoS protection
