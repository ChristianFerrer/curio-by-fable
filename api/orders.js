// api/orders.js — GET y POST /api/orders
// GET: historial de pedidos del usuario autenticado
// POST: crear nuevo pedido (precios verificados server-side)
'use strict';

const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabaseAdmin();

  // Extraer y verificar token
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No autenticado: se requiere token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido o expirado' });

  // ── GET: Historial de pedidos ────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, status, subtotal, shipping_cost, total, shipping_address, notes, created_at,
        order_items (
          id, quantity, unit_price, product_snapshot
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[orders GET] Error:', error.message);
      return res.status(500).json({ error: 'Error al obtener pedidos' });
    }

    return res.status(200).json({ orders: data || [] });
  }

  // ── POST: Crear pedido ───────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (_) {
      return res.status(400).json({ error: 'Body JSON inválido' });
    }

    const { items, shipping_address, notes } = body || {};

    // Validar campos obligatorios
    if (!items?.length) return res.status(400).json({ error: 'El carrito está vacío' });
    if (!shipping_address?.full_name || !shipping_address?.address_line1 || !shipping_address?.city || !shipping_address?.postal_code) {
      return res.status(400).json({ error: 'Dirección de envío incompleta' });
    }

    // Obtener precios reales desde la BD (nunca confiar en el cliente)
    const productIds = [...new Set(items.map(i => i.product_id))];
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, name, slug, price, stock, images, active, category')
      .in('id', productIds)
      .eq('active', true);

    if (prodErr) return res.status(500).json({ error: 'Error verificando productos' });

    const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));

    // Verificar disponibilidad y calcular totales
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = productMap[item.product_id];
      if (!product) return res.status(400).json({ error: `Producto no disponible: ${item.product_id}` });

      const qty = Math.max(1, parseInt(item.quantity) || 1);
      if (product.stock < qty) {
        return res.status(400).json({ error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}` });
      }

      subtotal += product.price * qty;

      orderItems.push({
        product_id: product.id,
        quantity:   qty,
        unit_price: product.price,
        product_snapshot: {
          name:      product.name,
          slug:      product.slug,
          image_url: product.images?.[0] || null,
          category:  product.category,
        },
      });
    }

    // Envío gratuito a partir de 50€
    const shippingCost = subtotal >= 50 ? 0 : 4.99;
    const total = Math.round((subtotal + shippingCost) * 100) / 100;

    // Insertar pedido
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id:          user.id,
        subtotal:         Math.round(subtotal * 100) / 100,
        shipping_cost:    shippingCost,
        total,
        shipping_address,
        notes:            notes || null,
        status:           'pendiente',
      })
      .select()
      .single();

    if (orderErr) {
      console.error('[orders POST] Error creando pedido:', orderErr.message);
      return res.status(500).json({ error: 'Error al crear el pedido' });
    }

    // Insertar líneas de pedido
    const itemsWithOrderId = orderItems.map(i => ({ ...i, order_id: order.id }));
    const { error: itemsErr } = await supabase.from('order_items').insert(itemsWithOrderId);
    if (itemsErr) {
      console.error('[orders POST] Error insertando items:', itemsErr.message);
    }

    // Decrementar stock (best-effort)
    for (const item of items) {
      const product = productMap[item.product_id];
      if (!product) continue;
      const qty = Math.max(1, parseInt(item.quantity) || 1);
      await supabase
        .from('products')
        .update({ stock: product.stock - qty })
        .eq('id', item.product_id);
    }

    return res.status(201).json({
      order_id:      order.id,
      total,
      shipping_cost: shippingCost,
      status:        'pendiente',
    });
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
