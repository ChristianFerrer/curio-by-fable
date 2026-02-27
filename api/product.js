// api/product.js — GET /api/product?slug=...
// Devuelve un producto completo por su slug
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');
const { PRODUCTS }         = require('./_lib/seed-data');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Método no permitido' });

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'Falta el parámetro slug' });

  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .schema('curio').from('products')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .single();

    if (error) {
      // Fallback a datos locales
      console.warn('[product] Usando datos locales:', error.message);
      const product = PRODUCTS.find(p => p.slug === slug && p.active);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
      const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id && p.active).slice(0, 4)
        .map(p => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, compare_price: p.compare_price, images: p.images, category: p.category }));
      return res.status(200).json({ ...product, related, _source: 'local' });
    }

    if (!data) return res.status(404).json({ error: 'Producto no encontrado' });

    // Productos relacionados
    const { data: related } = await supabase
      .schema('curio').from('products')
      .select('id, name, slug, price, compare_price, images, category')
      .eq('category', data.category)
      .eq('active', true)
      .neq('id', data.id)
      .limit(4);

    return res.status(200).json({ ...data, related: related || [] });

  } catch (e) {
    console.error('[product] Error inesperado:', e.message);
    const product = PRODUCTS.find(p => p.slug === slug && p.active);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id && p.active).slice(0, 4)
      .map(p => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, compare_price: p.compare_price, images: p.images, category: p.category }));
    return res.status(200).json({ ...product, related, _source: 'local' });
  }
};
