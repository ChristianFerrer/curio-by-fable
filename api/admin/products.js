// api/admin/products.js — CRUD completo de productos para admin
// GET    /api/admin/products         — listar todos
// POST   /api/admin/products         — crear producto (con imagen opcional en base64)
// PUT    /api/admin/products?id=...  — actualizar producto
// DELETE /api/admin/products?id=...  — borrado lógico (active = false)
'use strict';

const { getSupabaseAdmin } = require('../_lib/supabase');
const { requireAdmin }     = require('../_lib/auth-admin');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { error: adminErr } = await requireAdmin(req);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const supabase = getSupabaseAdmin();

  // ── GET: Listar todos los productos ─────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .schema('curio').from('products')
      .select('id, name, slug, price, compare_price, category, age_min, age_max, stock, images, featured, active, created_at, updated_at, material, dimensions')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[admin/products GET] Error:', error.message);
      return res.status(500).json({ error: 'Error listando productos' });
    }
    return res.status(200).json({ products: data || [] });
  }

  // ── POST: Crear producto ─────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch (_) { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const {
      name, slug, description, long_description,
      price, compare_price, category,
      age_min, age_max, stock,
      featured, active, material, dimensions, weight_grams,
      image_base64,
    } = body || {};

    if (!name || !slug || !price || !category) {
      return res.status(400).json({ error: 'Campos obligatorios: name, slug, price, category' });
    }

    let images = [];
    if (image_base64) {
      const uploadedUrl = await uploadImage(supabase, image_base64, slug);
      if (uploadedUrl) images = [uploadedUrl];
    }

    const { data, error: insertErr } = await supabase
      .schema('curio').from('products')
      .insert({
        name,
        slug:             slug.toLowerCase().replace(/\s+/g, '-'),
        description:      description     || null,
        long_description: long_description || null,
        price:            parseFloat(price),
        compare_price:    compare_price ? parseFloat(compare_price) : null,
        category,
        age_min:          age_min != null ? parseInt(age_min) : 0,
        age_max:          age_max != null ? parseInt(age_max) : 99,
        stock:            parseInt(stock) || 0,
        images,
        featured:         !!featured,
        active:           active !== false,
        material:         material   || 'Madera maciza',
        dimensions:       dimensions || null,
        weight_grams:     weight_grams ? parseInt(weight_grams) : null,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[admin/products POST] Error:', insertErr.message);
      if (insertErr.code === '23505') return res.status(409).json({ error: 'El slug ya existe. Usa uno diferente.' });
      return res.status(500).json({ error: 'Error creando el producto' });
    }
    return res.status(201).json(data);
  }

  // ── PUT: Actualizar producto ─────────────────────────────
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta el parámetro id' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch (_) { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const { image_base64, ...fields } = body || {};

    // Subir nueva imagen si se proporciona
    if (image_base64) {
      const uploadedUrl = await uploadImage(supabase, image_base64, id);
      if (uploadedUrl) {
        // Agregar a imágenes existentes o crear array nuevo
        const { data: current } = await supabase.schema('curio').from('products').select('images').eq('id', id).single();
        fields.images = [uploadedUrl, ...((current?.images || []).filter(u => u !== uploadedUrl))].slice(0, 5);
      }
    }

    // Limpiar campos no permitidos en update
    delete fields.id;
    delete fields.created_at;

    if (fields.price)         fields.price         = parseFloat(fields.price);
    if (fields.compare_price) fields.compare_price = parseFloat(fields.compare_price);
    if (fields.stock != null) fields.stock         = parseInt(fields.stock);
    if (fields.age_min != null) fields.age_min     = parseInt(fields.age_min);
    if (fields.age_max != null) fields.age_max     = parseInt(fields.age_max);

    const { data, error: updateErr } = await supabase
      .schema('curio').from('products')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[admin/products PUT] Error:', updateErr.message);
      return res.status(500).json({ error: 'Error actualizando el producto' });
    }
    return res.status(200).json(data);
  }

  // ── DELETE: Borrado lógico ───────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta el parámetro id' });

    const { error: delErr } = await supabase
      .schema('curio').from('products')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (delErr) {
      console.error('[admin/products DELETE] Error:', delErr.message);
      return res.status(500).json({ error: 'Error eliminando el producto' });
    }
    return res.status(200).json({ ok: true, message: 'Producto desactivado correctamente' });
  }

  return res.status(405).json({ error: 'Método no permitido' });
};

// ── Helper: subir imagen a Supabase Storage ──────────────────
async function uploadImage(supabase, base64, nameHint) {
  try {
    const buffer   = Buffer.from(base64, 'base64');
    const filename = `products/${nameHint}-${Date.now()}.jpg`;

    const { data: uploaded, error: uploadErr } = await supabase.storage
      .from('product-images')
      .upload(filename, buffer, {
        contentType: 'image/jpeg',
        upsert:      false,
      });

    if (uploadErr || !uploaded?.path) {
      console.error('[admin/products] Upload error:', uploadErr?.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(uploaded.path);

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error('[admin/products] uploadImage error:', err.message);
    return null;
  }
}
