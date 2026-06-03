import { createClient } from '@supabase/supabase-js';

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
    persistSession: true,
    autoRefreshToken: true,
  },
});
