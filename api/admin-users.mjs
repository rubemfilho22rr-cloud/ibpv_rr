import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const VALID_ROLES = new Set(['administrador', 'tesouraria', 'conselho', 'membro']);

function json(response, status, body) {
  response.status(status).json(body);
}

function temporaryPassword() {
  return `IBPV!${randomBytes(12).toString('base64url')}9a`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

async function authenticatedContext(request, adminClient) {
  const authorization = request.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) throw Object.assign(new Error('Sessão não informada.'), { status: 401 });

  const { data, error } = await adminClient.auth.getUser(accessToken);
  if (error || !data.user) {
    throw Object.assign(new Error('Sessão inválida ou expirada.'), { status: 401 });
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id,full_name,role,active,must_change_password')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile?.active) {
    throw Object.assign(new Error('Usuário sem acesso ao sistema.'), { status: 403 });
  }

  return { user: data.user, profile, accessToken };
}

async function requireAdministrator(request, adminClient) {
  const context = await authenticatedContext(request, adminClient);
  if (context.profile.role !== 'administrador' || context.profile.must_change_password) {
    throw Object.assign(new Error('Somente administradores podem executar esta ação.'), { status: 403 });
  }
  return context;
}

async function replacePosition(adminClient, userId, positionCode, assignedBy) {
  await adminClient
    .from('church_positions')
    .update({ assigned_user_id: null, assigned_at: null, assigned_by: null })
    .eq('assigned_user_id', userId);
  if (!positionCode) return;
  const { error } = await adminClient
    .from('church_positions')
    .update({ assigned_user_id: userId, assigned_at: new Date().toISOString(), assigned_by: assignedBy })
    .eq('code', positionCode);
  if (error) throw error;
}

async function recordAdminAction(adminClient, actor, action, targetId, description, metadata = {}) {
  await adminClient.from('audit_logs').insert({
    user_id: actor.user.id,
    actor_type: 'authenticated',
    actor_name: actor.profile.full_name,
    actor_role: actor.profile.role,
    action,
    table_name: 'profiles',
    record_id: targetId || null,
    description,
    result: 'success',
    metadata
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Método não permitido.' });
  }
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return json(response, 503, { error: 'Administração de usuários ainda não foi configurada no servidor.' });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  try {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    const action = String(body.action || '');

    if (action === 'change-own-password') {
      const context = await authenticatedContext(request, adminClient);
      const password = String(body.password || '');
      if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return json(response, 400, { error: 'A nova senha deve ter ao menos 10 caracteres, com letras e números.' });
      }
      const { error } = await adminClient.auth.admin.updateUserById(context.user.id, { password });
      if (error) throw error;
      const { error: profileError } = await adminClient
        .from('profiles')
        .update({ must_change_password: false, last_access_at: new Date().toISOString() })
        .eq('id', context.user.id);
      if (profileError) throw profileError;
      await recordAdminAction(
        adminClient,
        context,
        'password_changed',
        context.user.id,
        'O usuário definiu uma nova senha no primeiro acesso.'
      );
      return json(response, 200, { ok: true });
    }

    const actor = await requireAdministrator(request, adminClient);

    if (action === 'list') {
      const { data: profiles, error: profilesError } = await adminClient
        .from('profiles')
        .select('id,full_name,email,role,active,must_change_password,created_at,updated_at')
        .order('full_name');
      if (profilesError) throw profilesError;
      const { data: positions, error: positionsError } = await adminClient
        .from('church_positions')
        .select('code,label,sort_order,assigned_user_id,assigned_at')
        .order('sort_order');
      if (positionsError) throw positionsError;
      return json(response, 200, { users: profiles || [], positions: positions || [] });
    }

    if (action === 'create') {
      const fullName = normalizeName(body.fullName);
      const email = normalizeEmail(body.email);
      const role = String(body.role || '');
      const positionCode = body.positionCode || null;
      if (fullName.length < 3 || !email.includes('@') || !VALID_ROLES.has(role)) {
        return json(response, 400, { error: 'Revise nome, e-mail e permissão do novo usuário.' });
      }

      const password = temporaryPassword();
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (error) throw error;

      try {
        const { error: profileError } = await adminClient
          .from('profiles')
          .update({
            full_name: fullName,
            email,
            role,
            active: true,
            must_change_password: true
          })
          .eq('id', data.user.id);
        if (profileError) throw profileError;
        await replacePosition(adminClient, data.user.id, positionCode, actor.user.id);
        await recordAdminAction(
          adminClient,
          actor,
          'user_created',
          data.user.id,
          `Usuário ${fullName} criado com senha temporária.`,
          { role, position_code: positionCode }
        );
      } catch (setupError) {
        await adminClient.auth.admin.deleteUser(data.user.id);
        throw setupError;
      }

      return json(response, 200, {
        user: { id: data.user.id, full_name: fullName, email, role, active: true, must_change_password: true },
        temporaryPassword: password
      });
    }

    if (action === 'update') {
      const userId = String(body.userId || '');
      const fullName = normalizeName(body.fullName);
      const email = normalizeEmail(body.email);
      const role = String(body.role || '');
      const positionCode = body.positionCode || null;
      const active = body.active !== false;
      if (!userId || fullName.length < 3 || !email.includes('@') || !VALID_ROLES.has(role)) {
        return json(response, 400, { error: 'Revise os dados do usuário.' });
      }
      if (userId === actor.user.id && (!active || role !== 'administrador')) {
        return json(response, 400, { error: 'Você não pode desativar nem retirar sua própria permissão de administrador.' });
      }
      if (!active || role !== 'administrador') {
        const { count, error: countError } = await adminClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'administrador')
          .eq('active', true)
          .neq('id', userId);
        if (countError) throw countError;
        const { data: targetProfile, error: targetError } = await adminClient
          .from('profiles')
          .select('role,active')
          .eq('id', userId)
          .single();
        if (targetError) throw targetError;
        if (targetProfile.role === 'administrador' && targetProfile.active && count === 0) {
          return json(response, 400, { error: 'É necessário manter pelo menos um administrador ativo.' });
        }
      }
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (authError) throw authError;
      const { error } = await adminClient
        .from('profiles')
        .update({ full_name: fullName, email, role, active })
        .eq('id', userId);
      if (error) throw error;
      await replacePosition(adminClient, userId, positionCode, actor.user.id);
      await recordAdminAction(
        adminClient,
        actor,
        'user_updated',
        userId,
        `Cadastro de ${fullName} atualizado.`,
        { role, active, position_code: positionCode }
      );
      return json(response, 200, { ok: true });
    }

    if (action === 'reset-password') {
      const userId = String(body.userId || '');
      if (!userId) return json(response, 400, { error: 'Usuário não informado.' });
      const password = temporaryPassword();
      const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (authError) throw authError;
      const { error } = await adminClient
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', userId);
      if (error) throw error;
      await recordAdminAction(
        adminClient,
        actor,
        'temporary_password_reset',
        userId,
        'Uma nova senha temporária foi gerada.'
      );
      return json(response, 200, { temporaryPassword: password });
    }

    return json(response, 400, { error: 'Ação administrativa desconhecida.' });
  } catch (error) {
    return json(response, error.status || 500, { error: error.message || 'Não foi possível concluir a operação.' });
  }
}
