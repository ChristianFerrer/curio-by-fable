// api/track-view.js — POST /api/track-view
// Registro anónimo de visitas de página para analíticas
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_) {
    return res.status(400).json({ error: 'Body inválido' });
  }

  const { page, session_id, user_id, referrer } = body || {};

  if (!page) return res.status(400).json({ error: 'Falta el campo page' });

  const supabase = getSupabaseAdmin();

  // Insertar sin esperar (fire and forget desde el cliente,
  // pero aquí sí esperamos para poder devolver 200)
  await supabase.from('page_views').insert({
    page:       page.substring(0, 500),
    session_id: session_id || null,
    user_id:    user_id || null,
    referrer:   referrer || null,
  });

  return res.status(200).json({ ok: true });
};
