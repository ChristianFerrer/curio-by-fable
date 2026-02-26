// api/admin/dashboard.js — GET /api/admin/dashboard
// KPIs del panel de administración
'use strict';

const { getSupabaseAdmin } = require('../_lib/supabase');
const { requireAdmin }     = require('../_lib/auth-admin');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const { error: adminErr } = await requireAdmin(req);
  if (adminErr) return res.status(403).json({ error: adminErr });

  const supabase = getSupabaseAdmin();

  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart  = new Date(Date.now() - 7  * 86400000).toISOString();
  const monthStart = new Date(Date.now() - 30 * 86400000).toISOString();
  const prevMonthStart = new Date(Date.now() - 60 * 86400000).toISOString();

  try {
    const [
      { count: ordersToday },
      { count: ordersWeek },
      { count: ordersMonth },
      { count: ordersPrevMonth },
      { count: newUsersToday },
      { count: newUsersWeek },
      { count: totalUsers },
      { data: revenueMonth },
      { data: revenuePrevMonth },
      { data: topProductsRaw },
      { count: pageViewsToday },
      { count: pageViewsWeek },
      { count: totalProducts },
      { count: lowStock },
      { data: recentOrders },
      { data: pageViewsByPage },
    ] = await Promise.all([
      // Pedidos
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', weekStart),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', prevMonthStart).lt('created_at', monthStart),
      // Usuarios
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekStart),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      // Revenue
      supabase.from('orders').select('total').gte('created_at', monthStart).neq('status', 'cancelado'),
      supabase.from('orders').select('total').gte('created_at', prevMonthStart).lt('created_at', monthStart).neq('status', 'cancelado'),
      // Top productos
      supabase.from('order_items').select('product_id, quantity, product_snapshot').gte('created_at', monthStart).limit(500),
      // Visitas
      supabase.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
      supabase.from('page_views').select('id', { count: 'exact', head: true }).gte('created_at', weekStart),
      // Productos
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('active', true).lt('stock', 5),
      // Pedidos recientes
      supabase.from('orders').select('id, status, total, created_at, shipping_address').order('created_at', { ascending: false }).limit(10),
      // Visitas por página
      supabase.from('page_views').select('page').gte('created_at', weekStart).limit(1000),
    ]);

    // Calcular revenue
    const revenueMonthTotal    = (revenueMonth || []).reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
    const revenuePrevMonthTotal = (revenuePrevMonth || []).reduce((s, o) => s + (parseFloat(o.total) || 0), 0);
    const revenueGrowth = revenuePrevMonthTotal > 0
      ? ((revenueMonthTotal - revenuePrevMonthTotal) / revenuePrevMonthTotal * 100).toFixed(1)
      : null;

    // Calcular crecimiento pedidos
    const ordersGrowth = (ordersPrevMonth || 0) > 0
      ? (((ordersMonth || 0) - (ordersPrevMonth || 0)) / (ordersPrevMonth || 0) * 100).toFixed(1)
      : null;

    // Agregar top productos
    const productCounts = {};
    for (const item of (topProductsRaw || [])) {
      const pid = item.product_id;
      if (!pid) continue;
      if (!productCounts[pid]) {
        productCounts[pid] = {
          product_id: pid,
          name:       item.product_snapshot?.name || 'Desconocido',
          quantity:   0,
        };
      }
      productCounts[pid].quantity += (item.quantity || 0);
    }
    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Contar visitas por página
    const pageCounts = {};
    for (const v of (pageViewsByPage || [])) {
      const p = v.page || '/';
      pageCounts[p] = (pageCounts[p] || 0) + 1;
    }
    const topPages = Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([page, count]) => ({ page, count }));

    return res.status(200).json({
      orders: {
        today:      ordersToday  || 0,
        week:       ordersWeek   || 0,
        month:      ordersMonth  || 0,
        growth:     ordersGrowth,
      },
      users: {
        total:     totalUsers    || 0,
        new_today: newUsersToday || 0,
        new_week:  newUsersWeek  || 0,
      },
      revenue: {
        month:      Math.round(revenueMonthTotal * 100) / 100,
        growth:     revenueGrowth,
      },
      products: {
        total:     totalProducts || 0,
        low_stock: lowStock      || 0,
      },
      page_views: {
        today: pageViewsToday || 0,
        week:  pageViewsWeek  || 0,
      },
      top_products:  topProducts,
      top_pages:     topPages,
      recent_orders: recentOrders || [],
    });
  } catch (err) {
    console.error('[admin/dashboard] Error:', err.message);
    return res.status(500).json({ error: 'Error calculando métricas' });
  }
};
