// api/admin/users.js — Gestión de usuarios para admin
// GET /api/admin/users — listar todos los usuarios con perfil y estadísticas
'use strict';

const { getSupabaseAdmin } = require('../_lib/supabase');
const { requireAdmin }     = require('../_lib/auth-admin');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const { error: adminErr } = await requireAdmin(req);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const supabase  = getSupabaseAdmin();
  const { page = '1', limit = '50', search } = req.query;
  const pageNum   = Math.max(1, parseInt(page) || 1);
  const pageSize  = Math.min(parseInt(limit) || 50, 100);
  const from      = (pageNum - 1) * pageSize;
  const to        = from + pageSize - 1;

  let query = supabase
    .from('profiles')
    .select('id, email, full_name, phone, is_admin, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data: profiles, error, count } = await query;

  if (error) {
    console.error('[admin/users GET] Error:', error.message);
    return res.status(500).json({ error: 'Error listando usuarios' });
  }

  // Contar pedidos por usuario
  const userIds = (profiles || []).map(p => p.id);
  let orderCounts = {};
  if (userIds.length) {
    const { data: orderData } = await supabase
      .schema('curio').from('orders')
      .select('user_id')
      .in('user_id', userIds);

    for (const o of (orderData || [])) {
      orderCounts[o.user_id] = (orderCounts[o.user_id] || 0) + 1;
    }
  }

  const usersWithStats = (profiles || []).map(p => ({
    ...p,
    total_orders: orderCounts[p.id] || 0,
  }));

  return res.status(200).json({
    users:      usersWithStats,
    total:      count || 0,
    page:       pageNum,
    totalPages: Math.ceil((count || 0) / pageSize),
  });
};
