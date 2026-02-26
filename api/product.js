// api/product.js — GET /api/product?slug=...
// Devuelve un producto completo por su slug
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const { slug } = req.query;

  if (!slug) return res.status(400).json({ error: 'Falta el parámetro slug' });

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .schema('curio').from('products')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  // Cargar productos relacionados (misma categoría, excluir el actual)
  const { data: related } = await supabase
    .schema('curio').from('products')
    .select('id, name, slug, price, compare_price, images, category')
    .eq('category', data.category)
    .eq('active', true)
    .neq('id', data.id)
    .limit(4);

  return res.status(200).json({ ...data, related: related || [] });
};
