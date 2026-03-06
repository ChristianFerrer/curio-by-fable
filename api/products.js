// api/products.js — GET /api/products
// Lista:    ?category=&search=&featured=&min_price=&max_price=&age_min=&age_max=&sort=&page=&limit=
// Producto: ?slug=<slug>  → devuelve producto único + relacionados
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');
const { PRODUCTS }         = require('./_lib/seed-data');

const VALID_SORT = ['newest', 'price_asc', 'price_desc', 'featured', 'name_asc'];
const PAGE_SIZE  = 20;

// Filtrar + ordenar + paginar los datos locales
function queryLocal(params) {
  const { category, search, featured, min_price, max_price, age_min, age_max, sort, pageNum, pageSize } = params;
  let items = PRODUCTS.filter(p => p.active);

  if (featured === 'true')    items = items.filter(p => p.featured);
  if (category)               items = items.filter(p => p.category === category);
  if (min_price)              items = items.filter(p => p.price >= parseFloat(min_price));
  if (max_price)              items = items.filter(p => p.price <= parseFloat(max_price));
  if (age_min)                items = items.filter(p => p.age_max >= parseInt(age_min));
  if (age_max)                items = items.filter(p => p.age_min <= parseInt(age_max));
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter(p => p.name.toLowerCase().includes(q) || (p.description||'').toLowerCase().includes(q));
  }

  const validSort = VALID_SORT.includes(sort) ? sort : 'newest';
  if (validSort === 'price_asc')   items.sort((a,b) => a.price - b.price);
  else if (validSort === 'price_desc') items.sort((a,b) => b.price - a.price);
  else if (validSort === 'name_asc')   items.sort((a,b) => a.name.localeCompare(b.name));
  else if (validSort === 'featured')   items.sort((a,b) => (b.featured?1:0) - (a.featured?1:0));
  else items.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

  const total = items.length;
  const from  = (pageNum - 1) * pageSize;
  const page  = items.slice(from, from + pageSize).map(p => ({
    id: p.id, name: p.name, slug: p.slug, price: p.price,
    compare_price: p.compare_price, category: p.category,
    age_min: p.age_min, age_max: p.age_max,
    images: p.images, featured: p.featured, stock: p.stock, material: p.material,
  }));

  return { products: page, total, totalPages: Math.ceil(total / pageSize) };
}

// ── Handler único para producto por slug ──────────────────
async function handleSingleProduct(req, res, slug) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .schema('curio').from('products')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .single();

    if (error) {
      console.warn('[products/slug] Usando datos locales:', error.message);
      const product = PRODUCTS.find(p => p.slug === slug && p.active);
      if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
      const related = PRODUCTS
        .filter(p => p.category === product.category && p.id !== product.id && p.active)
        .slice(0, 4)
        .map(p => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, compare_price: p.compare_price, images: p.images, category: p.category }));
      return res.status(200).json({ ...product, related, _source: 'local' });
    }

    if (!data) return res.status(404).json({ error: 'Producto no encontrado' });

    const { data: related } = await supabase
      .schema('curio').from('products')
      .select('id, name, slug, price, compare_price, images, category')
      .eq('category', data.category)
      .eq('active', true)
      .neq('id', data.id)
      .limit(4);

    return res.status(200).json({ ...data, related: related || [] });

  } catch (e) {
    console.error('[products/slug] Error:', e.message);
    const product = PRODUCTS.find(p => p.slug === slug && p.active);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    const related = PRODUCTS
      .filter(p => p.category === product.category && p.id !== product.id && p.active)
      .slice(0, 4)
      .map(p => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, compare_price: p.compare_price, images: p.images, category: p.category }));
    return res.status(200).json({ ...product, related, _source: 'local' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Método no permitido' });

  // Ruta de producto único: /api/products?slug=...
  if (req.query.slug) return handleSingleProduct(req, res, req.query.slug);

  const {
    category, search, featured,
    min_price, max_price,
    age_min, age_max,
    sort = 'newest',
    page = '1',
    limit,
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(parseInt(limit) || PAGE_SIZE, 100);
  const from     = (pageNum - 1) * pageSize;
  const to       = from + pageSize - 1;

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .schema('curio').from('products')
      .select('id, name, slug, price, compare_price, category, age_min, age_max, images, featured, stock, material', { count: 'exact' })
      .eq('active', true);

    if (featured === 'true')     query = query.eq('featured', true);
    if (category)                query = query.eq('category', category);
    if (min_price)               query = query.gte('price', parseFloat(min_price));
    if (max_price)               query = query.lte('price', parseFloat(max_price));
    if (age_min)                 query = query.gte('age_max', parseInt(age_min));
    if (age_max)                 query = query.lte('age_min', parseInt(age_max));
    if (search && search.trim()) query = query.ilike('name', `%${search.trim()}%`);

    const validSort = VALID_SORT.includes(sort) ? sort : 'newest';
    if (validSort === 'price_asc')       query = query.order('price', { ascending: true });
    else if (validSort === 'price_desc') query = query.order('price', { ascending: false });
    else if (validSort === 'name_asc')   query = query.order('name',  { ascending: true });
    else if (validSort === 'featured')   query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
    else                                 query = query.order('created_at', { ascending: false });

    query = query.range(from, to);
    const { data, error, count } = await query;

    if (error) {
      // Fallback a datos locales si curio schema no existe
      console.warn('[products] Usando datos locales:', error.message);
      const local = queryLocal({ category, search, featured, min_price, max_price, age_min, age_max, sort, pageNum, pageSize });
      // Caché de 60s para listados con filtros, 5min para featured/sin filtros
      const ttl = (featured || category || search) ? 60 : 300;
      res.setHeader('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
      return res.status(200).json({ ...local, page: pageNum, pageSize, _source: 'local' });
    }

    const ttl = (featured || category || search) ? 60 : 300;
    res.setHeader('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    return res.status(200).json({
      products:   data || [],
      total:      count || 0,
      page:       pageNum,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });

  } catch (e) {
    console.error('[products] Error inesperado:', e.message);
    const local = queryLocal({ category, search, featured, min_price, max_price, age_min, age_max, sort, pageNum, pageSize });
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ ...local, page: pageNum, pageSize, _source: 'local' });
  }
};
