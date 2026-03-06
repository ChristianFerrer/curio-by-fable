// api/create-payment-intent.js — POST /api/create-payment-intent
// Crea un Stripe PaymentIntent y un pedido en Supabase (status: 'esperando_pago')
// Los precios se verifican server-side; el cliente nunca puede manipularlos
'use strict';

const Stripe          = require('stripe');
const { getSupabaseAdmin } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const supabase = getSupabaseAdmin();
  const stripe   = Stripe(process.env.STRIPE_SECRET_KEY);

  // ── Autenticación ─────────────────────────────────────────
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No autenticado: se requiere token' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Token inválido o expirado' });

  // ── Parsear body ──────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_) {
    return res.status(400).json({ error: 'Body JSON inválido' });
  }

  const { items, shipping_address, notes } = body || {};

  // Validar campos obligatorios
  if (!items?.length) return res.status(400).json({ error: 'El carrito está vacío' });
  if (!shipping_address?.full_name || !shipping_address?.address_line1 ||
      !shipping_address?.city     || !shipping_address?.postal_code) {
    return res.status(400).json({ error: 'Dirección de envío incompleta' });
  }

  // ── Verificar precios y stock server-side ─────────────────
  const productIds = [...new Set(items.map(i => i.product_id))];
  const { data: products, error: prodErr } = await supabase
    .schema('curio').from('products')
    .select('id, name, slug, price, stock, images, active, category')
    .in('id', productIds)
    .eq('active', true);

  if (prodErr) return res.status(500).json({ error: 'Error verificando productos' });

  const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));

  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const product = productMap[item.product_id];
    if (!product) return res.status(400).json({ error: `Producto no disponible: ${item.product_id}` });

    const qty = Math.max(1, parseInt(item.quantity) || 1);
    if (product.stock < qty) {
      return res.status(400).json({
        error: `Stock insuficiente para "${product.name}". Disponible: ${product.stock}`,
      });
    }

    subtotal += product.price * qty;

    orderItems.push({
      product_id:       product.id,
      quantity:         qty,
      unit_price:       product.price,
      product_snapshot: {
        name:      product.name,
        slug:      product.slug,
        image_url: product.images?.[0] || null,
        category:  product.category,
      },
    });
  }

  // Envío gratuito a partir de 50 €
  const shippingCost = subtotal >= 50 ? 0 : 4.99;
  const total        = Math.round((subtotal + shippingCost) * 100) / 100;

  // ── Crear orden en Supabase (esperando_pago) ──────────────
  const { data: order, error: orderErr } = await supabase
    .schema('curio').from('orders')
    .insert({
      user_id:          user.id,
      subtotal:         Math.round(subtotal * 100) / 100,
      shipping_cost:    shippingCost,
      total,
      shipping_address,
      notes:            notes || null,
      status:           'esperando_pago',
      payment_status:   'pending',
    })
    .select()
    .single();

  if (orderErr) {
    console.error('[create-payment-intent] Error creando orden:', orderErr.message);
    return res.status(500).json({ error: 'Error al crear el pedido' });
  }

  // Insertar líneas de pedido
  const itemsWithOrderId = orderItems.map(i => ({ ...i, order_id: order.id }));
  const { error: itemsErr } = await supabase
    .schema('curio').from('order_items')
    .insert(itemsWithOrderId);

  if (itemsErr) {
    console.error('[create-payment-intent] Error insertando items:', itemsErr.message);
  }

  // Decrementar stock (best-effort)
  for (const item of items) {
    const product = productMap[item.product_id];
    if (!product) continue;
    const qty = Math.max(1, parseInt(item.quantity) || 1);
    await supabase
      .schema('curio').from('products')
      .update({ stock: product.stock - qty })
      .eq('id', item.product_id);
  }

  // ── Crear Stripe PaymentIntent ─────────────────────────────
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(total * 100), // Stripe trabaja en céntimos
      currency: 'eur',
      metadata: {
        order_id: order.id,
        user_id:  user.id,
      },
      automatic_payment_methods: { enabled: true },
    });
  } catch (stripeErr) {
    console.error('[create-payment-intent] Stripe error:', stripeErr.message);
    // Revertir estado de la orden a cancelado para no dejar basura
    await supabase.schema('curio').from('orders')
      .update({ status: 'cancelado', payment_status: 'failed' })
      .eq('id', order.id);
    return res.status(502).json({ error: 'Error al inicializar el pago. Inténtalo de nuevo.' });
  }

  // Guardar el payment_intent_id en la orden
  await supabase.schema('curio').from('orders')
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq('id', order.id);

  return res.status(200).json({
    client_secret: paymentIntent.client_secret,
    order_id:      order.id,
    total,
    shipping_cost: shippingCost,
  });
};
