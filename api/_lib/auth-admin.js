// api/_lib/auth-admin.js — Middleware de autenticación para rutas admin
// Verifica que el token JWT pertenece a un usuario con is_admin = true
'use strict';

const { getSupabaseAdmin } = require('./supabase');

/**
 * Verifica que la solicitud viene de un administrador autenticado.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ user: object|null, profile: object|null, error: string|null }>}
 */
async function requireAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return { user: null, profile: null, error: 'No autorizado: falta token de autenticación' };
  }

  const supabase = getSupabaseAdmin();

  // Verificar JWT con el cliente service role
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return { user: null, profile: null, error: 'Token inválido o expirado' };
  }

  // Verificar is_admin en la tabla profiles
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin, full_name, email')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { user: null, profile: null, error: 'Perfil de usuario no encontrado' };
  }

  if (!profile.is_admin) {
    return { user: null, profile: null, error: 'Acceso denegado: no tienes permisos de administrador' };
  }

  return { user, profile, error: null };
}

module.exports = { requireAdmin };
