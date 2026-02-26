// api/categories.js — GET /api/categories
// Devuelve todas las categorías ordenadas por sort_order
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .schema('curio').from('categories')
    .select('*')
    .order('sort_order');

  if (error) {
    console.error('[categories] Error:', error.message);
    return res.status(500).json({ error: 'Error al obtener categorías' });
  }

  return res.status(200).json({ categories: data || [] });
};
