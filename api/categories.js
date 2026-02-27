// api/categories.js — GET /api/categories
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');
const { CATEGORIES }       = require('./_lib/seed-data');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Método no permitido' });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .schema('curio').from('categories')
      .select('*').order('sort_order');

    // Si el schema curio no existe aún, usar datos hardcodeados
    if (error) {
      console.warn('[categories] Usando datos locales (schema curio no disponible):', error.message);
      return res.status(200).json({ categories: CATEGORIES, _source: 'local' });
    }

    return res.status(200).json({ categories: data || [] });
  } catch (e) {
    console.error('[categories] Error inesperado:', e.message);
    return res.status(200).json({ categories: CATEGORIES, _source: 'local' });
  }
};
