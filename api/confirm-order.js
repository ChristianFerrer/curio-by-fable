// api/confirm-order.js — POST /api/confirm-order
// Verifica el PaymentIntent con Stripe server-side y actualiza el pedido a 'procesando'
// No usamos webhooks para evitar el problema de body pre-parseado en Vercel
'use strict';

const Stripe               = require('stripe');
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

  const { payment_intent_id, order_id } = body || {};

  if (!payment_intent_id) return res.status(400).json({ error: 'Falta payment_intent_id' });
  if (!order_id)          return res.status(400).json({ error: 'Falta order_id' });

  // ── Verificar PaymentIntent con Stripe ────────────────────
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
  } catch (stripeErr) {
    console.error('[confirm-order] Stripe retrieve error:', stripeErr.message);
    return res.status(502).json({ error: 'Error al verificar el pago con Stripe' });
  }

  // Solo aceptar pagos completados
  if (paymentIntent.status !== 'succeeded') {
    return res.status(402).json({
      error: `El pago no está completado (estado: ${paymentIntent.status}). Inténtalo de nuevo.`,
    });
  }

  // Verificar que el metadata del PaymentIntent coincide (anti-fraude)
  if (paymentIntent.metadata?.order_id !== order_id) {
    console.error('[confirm-order] Mismatch: PI order_id vs claimed order_id', {
      pi_order: paymentIntent.metadata?.order_id,
      claimed:  order_id,
    });
    return res.status(400).json({ error: 'El pago no corresponde a este pedido' });
  }

  // ── Verificar que la orden pertenece al usuario ───────────
  const { data: order, error: fetchErr } = await supabase
    .schema('curio').from('orders')
    .select('id, status, payment_status, stripe_payment_intent_id')
    .eq('id', order_id)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !order) {
    return res.status(404).json({ error: 'Pedido no encontrado' });
  }

  // Evitar doble-confirmación (idempotente)
  if (order.status === 'procesando' && order.payment_status === 'succeeded') {
    return res.status(200).json({ ok: true, order_id, already_confirmed: true });
  }

  // Solo confirmar si está en estado esperando_pago
  if (order.status !== 'esperando_pago') {
    return res.status(409).json({
      error: `El pedido está en estado "${order.status}" y no puede confirmarse.`,
    });
  }

  // ── Actualizar orden a 'procesando' ───────────────────────
  const { error: updateErr } = await supabase
    .schema('curio').from('orders')
    .update({
      status:                   'procesando',
      payment_status:           'succeeded',
      stripe_payment_intent_id: paymentIntent.id,
    })
    .eq('id', order_id)
    .eq('status', 'esperando_pago'); // extra check para evitar race conditions

  if (updateErr) {
    console.error('[confirm-order] Error actualizando orden:', updateErr.message);
    return res.status(500).json({ error: 'Error al confirmar el pedido en la base de datos' });
  }

  console.log(`[confirm-order] Pedido ${order_id} confirmado. PI: ${paymentIntent.id}`);

  return res.status(200).json({ ok: true, order_id });
};
