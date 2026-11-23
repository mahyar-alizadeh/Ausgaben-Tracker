// Zugangsdaten für Supabase (Dashboard: Project Settings, API)
const SUPABASE_URL = "https://vzhacopmsznqmcfykhxn.supabase.co";
const SUPABASE_KEY = "sb_publishable_lWUwFUhCBZbTe6KFyAEy5A_Q2kEgE0M";

const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);