import { createClient } from '@supabase/supabase-js';

// ─── SECURITY FIX ────────────────────────────────────────────────────────────
// ORIGINAL PROBLEM: Credentials were hardcoded as fallback values in this file,
// meaning anyone who reads the source code (e.g. on GitHub) gets your Supabase
// URL and anon key. Even though the anon key is "public", exposing it in a repo
// allows attackers to craft direct database queries without going through your app.
//
// FIX: Read ONLY from environment variables. No hardcoded fallbacks.
// If the env vars are missing, throw a clear error at startup rather than
// silently using a leaked credential.
//
// ── HOW TO SET UP YOUR .env FILE ─────────────────────────────────────────────
// 1. In the ROOT of your project create a file called: .env
// 2. Paste these two lines (replace with your real values):
//
//      REACT_APP_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
//      REACT_APP_SUPABASE_ANON_KEY=your_anon_key_here
//
// 3. Make sure ".env" is listed in your .gitignore file so it is NEVER committed
//    to GitHub. Check with: cat .gitignore | grep .env
//
// 4. On Vercel: go to your project → Settings → Environment Variables and add
//    the same two keys there so production also works.
// ─────────────────────────────────────────────────────────────────────────────

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    '❌ Missing Supabase config.\n' +
    'Create a .env file in the project root with:\n' +
    '  REACT_APP_SUPABASE_URL=...\n' +
    '  REACT_APP_SUPABASE_ANON_KEY=...\n' +
    'Then restart the dev server.'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    // Persist session in localStorage so users stay logged in on refresh
    persistSession: true,
    // Automatically refresh the JWT before it expires
    autoRefreshToken: true,
  },
});
