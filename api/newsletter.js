// api/newsletter.js — POST /api/newsletter
// Suscripción al newsletter
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

  const { email } = body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .schema('curio').from('newsletter_subscribers')
    .insert({ email: email.toLowerCase().trim() });

  if (error) {
    if (error.code === '23505') {
      return res.status(200).json({ ok: true, already: true, message: 'Este email ya está suscrito' });
    }
    console.error('[newsletter] Error:', error.message);
    return res.status(500).json({ error: 'Error al suscribirse' });
  }

  return res.status(201).json({ ok: true, message: '¡Gracias por suscribirte!' });
};
