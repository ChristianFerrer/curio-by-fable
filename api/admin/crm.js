// api/admin/crm.js — GET /api/admin/crm  (lista clientes + datos unificados)
//                    GET /api/admin/crm?id=UUID  (detalle de un cliente)
//                    POST /api/admin/crm/notes  (crear nota)
//                    PUT /api/admin/crm/notes?id=UUID  (editar nota)
//                    DELETE /api/admin/crm/notes?id=UUID  (eliminar nota)
'use strict';

const { getSupabaseAdmin } = require('../_lib/supabase');
const { requireAdmin }     = require('../_lib/auth-admin');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { error: adminErr } = await requireAdmin(req);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const supabase = getSupabaseAdmin();
  const { id, action } = req.query;

  // ── POST /api/admin/crm?action=note  → Crear nota ──────────────────────
  if (req.method === 'POST' && action === 'note') {
    const { customer_id, content, type } = req.body || {};
    if (!customer_id || !content) {
      return res.status(400).json({ error: 'Faltan campos: customer_id, content' });
    }
    const { data, error } = await supabase
      .schema('curio').from('crm_notes')
      .insert({ customer_id, content, type: type || 'nota' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ note: data });
  }

  // ── PUT /api/admin/crm?action=note&id=UUID  → Editar nota ──────────────
  if (req.method === 'PUT' && action === 'note' && id) {
    const { content, type } = req.body || {};
    if (!content) return res.status(400).json({ error: 'Falta el contenido de la nota' });
    const { data, error } = await supabase
      .schema('curio').from('crm_notes')
      .update({ content, type: type || 'nota', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ note: data });
  }

  // ── DELETE /api/admin/crm?action=note&id=UUID  → Eliminar nota ─────────
  if (req.method === 'DELETE' && action === 'note' && id) {
    const { error } = await supabase
      .schema('curio').from('crm_notes')
      .delete()
      .eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // ── GET /api/admin/crm?id=UUID  → Detalle de un cliente ────────────────
  if (id) {
    try {
      const [
        { data: profile },
        { data: orders },
        { data: notes },
        { data: pageViewsRaw },
      ] = await Promise.all([
        // Perfil
        supabase.from('profiles')
          .select('id, email, full_name, phone, is_admin, created_at')
          .eq('id', id)
          .single(),
        // Pedidos
        supabase.schema('curio').from('orders')
          .select('id, status, total, created_at, shipping_address, order_items(id, product_id, quantity, unit_price, product_snapshot)')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(50),
        // Notas CRM
        supabase.schema('curio').from('crm_notes')
          .select('id, content, type, created_at, updated_at')
          .eq('customer_id', id)
          .order('created_at', { ascending: false }),
        // Page views recientes
        supabase.schema('curio').from('page_views')
          .select('page, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (!profile) return res.status(404).json({ error: 'Cliente no encontrado' });

      const totalSpent    = (orders || []).reduce((s, o) => o.status !== 'cancelado' ? s + (parseFloat(o.total) || 0) : s, 0);
      const lastOrderDate = orders && orders.length ? orders[0].created_at : null;

      // Últimas páginas visitadas únicas
      const seenPages = new Set();
      const recentPages = [];
      for (const v of (pageViewsRaw || [])) {
        if (!seenPages.has(v.page)) { seenPages.add(v.page); recentPages.push(v); }
        if (recentPages.length >= 10) break;
      }

      return res.status(200).json({
        customer: {
          ...profile,
          total_orders:    (orders || []).length,
          total_spent:     Math.round(totalSpent * 100) / 100,
          last_order_date: lastOrderDate,
        },
        orders:       orders || [],
        notes:        notes  || [],
        recent_pages: recentPages,
      });
    } catch (err) {
      console.error('[admin/crm] Error detalle:', err.message);
      return res.status(500).json({ error: 'Error obteniendo datos del cliente' });
    }
  }

  // ── GET /api/admin/crm  → Lista de clientes ─────────────────────────────
  try {
    const { search, segment, page = '1', limit = '50' } = req.query;
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(parseInt(limit) || 50, 200);
    const offset   = (pageNum - 1) * pageSize;

    // Obtener todos los perfiles con métricas de pedidos
    const { data: profiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, is_admin, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (profilesErr) throw profilesErr;

    // Enriquecer con datos de pedidos (en paralelo por lotes)
    const profileIds = (profiles || []).map(p => p.id);

    let ordersMap = {};
    if (profileIds.length) {
      const { data: ordersData } = await supabase
        .schema('curio').from('orders')
        .select('id, user_id, status, total, created_at')
        .in('user_id', profileIds);

      for (const o of (ordersData || [])) {
        if (!ordersMap[o.user_id]) ordersMap[o.user_id] = { count: 0, spent: 0, lastDate: null };
        ordersMap[o.user_id].count++;
        if (o.status !== 'cancelado') ordersMap[o.user_id].spent += parseFloat(o.total) || 0;
        if (!ordersMap[o.user_id].lastDate || o.created_at > ordersMap[o.user_id].lastDate) {
          ordersMap[o.user_id].lastDate = o.created_at;
        }
      }
    }

    // Obtener último page_view por usuario
    let lastViewMap = {};
    if (profileIds.length) {
      const { data: viewsData } = await supabase
        .schema('curio').from('page_views')
        .select('user_id, created_at')
        .in('user_id', profileIds)
        .order('created_at', { ascending: false })
        .limit(profileIds.length * 3); // aprox. last view per user

      for (const v of (viewsData || [])) {
        if (!lastViewMap[v.user_id]) lastViewMap[v.user_id] = v.created_at;
      }
    }

    let customers = (profiles || []).map(p => {
      const ord = ordersMap[p.id] || { count: 0, spent: 0, lastDate: null };
      return {
        ...p,
        total_orders:    ord.count,
        total_spent:     Math.round(ord.spent * 100) / 100,
        last_order_date: ord.lastDate,
        last_visit_date: lastViewMap[p.id] || null,
        segment:         _segment(ord.count, ord.spent, ord.lastDate),
      };
    });

    // Filtros en memoria (rápido para < 500 clientes)
    if (search) {
      const q = search.toLowerCase();
      customers = customers.filter(c =>
        (c.email || '').toLowerCase().includes(q) ||
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      );
    }
    if (segment && segment !== 'all') {
      customers = customers.filter(c => c.segment === segment);
    }

    // Totales de segmentos para el panel
    const segmentCounts = { vip: 0, recurrente: 0, nuevo: 0, inactivo: 0, visitante: 0 };
    for (const c of customers) {
      if (segmentCounts[c.segment] !== undefined) segmentCounts[c.segment]++;
    }

    return res.status(200).json({
      customers,
      total:         customers.length,
      page:          pageNum,
      pageSize,
      segment_counts: segmentCounts,
    });
  } catch (err) {
    console.error('[admin/crm] Error lista:', err.message);
    return res.status(500).json({ error: 'Error obteniendo lista de clientes' });
  }
};

// Segmentación simple
function _segment(orders, spent, lastOrderDate) {
  const daysSinceOrder = lastOrderDate
    ? Math.floor((Date.now() - new Date(lastOrderDate)) / 86400000)
    : Infinity;

  if (orders === 0)          return 'visitante';
  if (spent >= 200 || orders >= 5) return 'vip';
  if (orders >= 2 && daysSinceOrder <= 90) return 'recurrente';
  if (orders >= 1 && daysSinceOrder <= 30) return 'nuevo';
  return 'inactivo';
}
