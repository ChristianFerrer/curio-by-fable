// api/_lib/supabase.js — Cliente Supabase admin (service role)
// Solo para uso en serverless functions — NUNCA en el cliente
'use strict';

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getSupabaseAdmin() {
  if (_client) return _client;

  const url     = process.env.SUPABASE_URL;
  const srvKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !srvKey) {
    throw new Error('[curio] Faltan variables de entorno: SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY');
  }

  _client = createClient(url, srvKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  });

  return _client;
}

module.exports = { getSupabaseAdmin };
