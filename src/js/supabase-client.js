// src/js/supabase-client.js — Singleton cliente público Supabase
// Lee credenciales de window.__CURIO_CONFIG__ (inyectado por /public/config.js)

const SUPABASE_URL  = window.__CURIO_CONFIG__?.supabaseUrl  || '';
const SUPABASE_ANON = window.__CURIO_CONFIG__?.supabaseAnon || '';

if (!SUPABASE_URL || !SUPABASE_ANON || SUPABASE_URL.includes('TU_PROYECTO')) {
  console.warn('[Curio] ⚠️ Supabase no configurado. Edita /public/config.js con tu URL y anon key.');
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,  // Necesario para Google OAuth redirect
  },
});

export default supabase;
