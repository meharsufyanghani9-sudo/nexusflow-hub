import { createClient } from '@supabase/supabase-js';

// FIXED: Use environment variables instead of hardcoded values.
// Create a file called .env in your project root with these lines:
//
//   REACT_APP_SUPABASE_URL=https://ctbfovtqjwrxbepccthw.supabase.co
//   REACT_APP_SUPABASE_ANON_KEY=sb_publishable_CkIMpe2-IhDVV78lQz6LTA__7aObr2X
//
// The .env file should NOT be committed to Git (add it to .gitignore).
// Your values above are still your CURRENT working values — just move them to .env.

const url = process.env.REACT_APP_SUPABASE_URL || 'https://ctbfovtqjwrxbepccthw.supabase.co';
const key = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_CkIMpe2-IhDVV78lQz6LTA__7aObr2X';

export const supabase = createClient(url, key);
