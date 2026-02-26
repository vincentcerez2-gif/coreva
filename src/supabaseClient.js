import { createClient } from "@supabase/supabase-js";

// --- CONFIGURE YOUR SUPABASE CREDENTIALS HERE ---
// Replace the values below with your actual Supabase Project URL and Public API Key.
const SUPABASE_URL = "https://eniwuiolxxswnuxhhtcw.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_Am3pYzRedAh7ErbKdvPIcw_L_CpkVpH";
// ------------------------------------------------

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
