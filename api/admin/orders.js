// api/admin/orders.js — Gestión de pedidos para admin
// GET /api/admin/orders          — listar todos los pedidos
// PUT /api/admin/orders?id=...   — actualizar estado del pedido
'use strict';

const { getSupabaseAdmin } = require('../_lib/supabase');
const { requireAdmin }     = require('../_lib/auth-admin');

const VALID_STATUSES = ['pendiente', 'procesando', 'enviado', 'entregado', 'cancelado'];

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { error: adminErr } = await requireAdmin(req);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const supabase = getSupabaseAdmin();

  // ── GET: Listar todos los pedidos ────────────────────────
  if (req.method === 'GET') {
    const { status, page = '1', limit = '50' } = req.query;
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(parseInt(limit) || 50, 100);
    const from = (pageNum - 1) * pageSize;
    const to   = from + pageSize - 1;

    let query = supabase
      .schema('curio').from('orders')
      .select(`
        id, status, subtotal, shipping_cost, total,
        shipping_address, notes, created_at, updated_at, user_id,
        order_items (
          id, quantity, unit_price, product_snapshot
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status && VALID_STATUSES.includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[admin/orders GET] Error:', error.message);
      return res.status(500).json({ error: 'Error listando pedidos' });
    }

    // Obtener emails de usuarios
    const userIds = [...new Set((data || []).map(o => o.user_id).filter(Boolean))];
    let userEmails = {};
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds);
      userEmails = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    }

    const ordersWithUser = (data || []).map(o => ({
      ...o,
      user_profile: userEmails[o.user_id] || null,
    }));

    return res.status(200).json({
      orders:     ordersWithUser,
      total:      count || 0,
      page:       pageNum,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  }

  // ── PUT: Actualizar estado ───────────────────────────────
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta el parámetro id' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch (_) { return res.status(400).json({ error: 'Body JSON inválido' }); }

    const { status } = body || {};

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Estado inválido. Válidos: ${VALID_STATUSES.join(', ')}` });
    }

    const { data, error: updateErr } = await supabase
      .schema('curio').from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[admin/orders PUT] Error:', updateErr.message);
      return res.status(500).json({ error: 'Error actualizando el pedido' });
    }
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
