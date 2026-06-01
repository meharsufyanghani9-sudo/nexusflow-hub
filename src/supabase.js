import { createClient } from '@supabase/supabase-js';

// ─── SECURITY FIX ───────────────────────────────────────────────────────────
// Credentials are now read ONLY from environment variables.
// The old hardcoded fallback values have been REMOVED because React bundles
// ALL source code and ships it to the browser — anyone could read them.
//
// WHAT YOU MUST DO (one-time setup):
//   1. In your project root folder, create a file called exactly:  .env
//   2. Paste these two lines into it (use YOUR real values from Supabase):
//
//        REACT_APP_SUPABASE_URL=https://ctbfovtqjwrxbepccthw.supabase.co
//        REACT_APP_SUPABASE_ANON_KEY=sb_publishable_CkIMpe2-IhDVV78lQz6LTA__7aObr2X
//
//   3. Open (or create) the file called  .gitignore  in your project root.
//      Add this line to it:   .env
//      This stops your keys being uploaded to GitHub.
//
//   4. IMPORTANT: Because your old keys were exposed in this zip file,
//      go to your Supabase dashboard → Settings → API → click "Regenerate"
//      next to the anon key to get a new one. Then update your .env file.
//
//   5. Restart your dev server after creating the .env file.
// ────────────────────────────────────────────────────────────────────────────

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    '❌ Supabase environment variables are missing!\n' +
    'Create a .env file in your project root with:\n' +
    'REACT_APP_SUPABASE_URL=your_url_here\n' +
    'REACT_APP_SUPABASE_ANON_KEY=your_key_here'
  );
}

export const supabase = createClient(url, key);
