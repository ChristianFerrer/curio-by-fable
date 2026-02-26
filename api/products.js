// api/products.js — GET /api/products
// Parámetros: category, search, featured, min_price, max_price, age_min, age_max, sort, page, limit
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');

const VALID_SORT = ['newest', 'price_asc', 'price_desc', 'featured', 'name_asc'];
const PAGE_SIZE  = 20;

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const {
    category, search, featured,
    min_price, max_price,
    age_min, age_max,
    sort = 'newest',
    page = '1',
    limit,
  } = req.query;

  const supabase  = getSupabaseAdmin();
  const pageNum   = Math.max(1, parseInt(page) || 1);
  const pageSize  = Math.min(parseInt(limit) || PAGE_SIZE, 100);
  const from      = (pageNum - 1) * pageSize;
  const to        = from + pageSize - 1;

  let query = supabase
    .schema('curio').from('products')
    .select(
      'id, name, slug, price, compare_price, category, age_min, age_max, images, featured, stock, material',
      { count: 'exact' }
    )
    .eq('active', true);

  // Filtros
  if (featured === 'true')     query = query.eq('featured', true);
  if (category)                query = query.eq('category', category);
  if (min_price)               query = query.gte('price', parseFloat(min_price));
  if (max_price)               query = query.lte('price', parseFloat(max_price));
  if (age_min)                 query = query.gte('age_max', parseInt(age_min));
  if (age_max)                 query = query.lte('age_min', parseInt(age_max));

  // Búsqueda por nombre
  if (search && search.trim()) {
    query = query.ilike('name', `%${search.trim()}%`);
  }

  // Orden
  const validSort = VALID_SORT.includes(sort) ? sort : 'newest';
  if (validSort === 'price_asc')  query = query.order('price', { ascending: true });
  else if (validSort === 'price_desc') query = query.order('price', { ascending: false });
  else if (validSort === 'name_asc')   query = query.order('name', { ascending: true });
  else if (validSort === 'featured')   query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
  else                                 query = query.order('created_at', { ascending: false });

  // Paginación
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('[products] Error:', error.message);
    return res.status(500).json({ error: 'Error al obtener productos' });
  }

  return res.status(200).json({
    products:   data || [],
    total:      count || 0,
    page:       pageNum,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  });
};
