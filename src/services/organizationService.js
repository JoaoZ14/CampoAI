import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { findOrCreateUser } from './userService.js';

function getClient() {
  return createSupabaseClient();
}

const BILLING = { FREE: 'free', PERSONAL: 'personal', TEAM: 'team' };

/**
 * @param {{ name?: string, maxSeats: number }} input
 */
export async function createOrganization(input) {
  const supabase = getClient();
  const maxSeats = Math.min(100, Math.max(1, Number(input.maxSeats) || 0));
  if (!Number.isFinite(maxSeats) || maxSeats < 1) {
    throw new AppError('maxSeats inválido (1–100).', 400);
  }

  const name = typeof input.name === 'string' ? input.name.trim() || null : null;

  const { data, error } = await supabase
    .from('organizations')
    .insert({ name, max_seats: maxSeats, is_active: true })
    .select('*')
    .single();

  if (error) {
    throw new AppError(`Erro ao criar organização: ${error.message}`, 500);
  }

  return mapOrgRow(data);
}

export async function listOrganizations() {
  const supabase = getClient();

  const { data: orgs, error: e1 } = await supabase
    .from('organizations')
    .select('id, name, max_seats, is_active, created_at')
    .order('created_at', { ascending: false });

  if (e1) {
    throw new AppError(`Erro ao listar organizações: ${e1.message}`, 500);
  }

  const ids = (orgs ?? []).map((o) => o.id);
  if (ids.length === 0) {
    return [];
  }

  const { data: seats, error: e2 } = await supabase
    .from('organization_seats')
    .select('organization_id, phone, active, created_at')
    .in('organization_id', ids);

  if (e2) {
    throw new AppError(`Erro ao listar assentos: ${e2.message}`, 500);
  }

  const activeCount = new Map();
  /** @type {Map<string, { phone: string, active: boolean, createdAt: string }[]>} */
  const byOrg = new Map();
  for (const s of seats ?? []) {
    if (s.active) {
      activeCount.set(s.organization_id, (activeCount.get(s.organization_id) ?? 0) + 1);
    }
    const list = byOrg.get(s.organization_id) ?? [];
    list.push({ phone: s.phone, active: s.active, createdAt: s.created_at });
    byOrg.set(s.organization_id, list);
  }

  return (orgs ?? []).map((row) => ({
    ...mapOrgRow(row),
    activeSeats: activeCount.get(row.id) ?? 0,
    seats: byOrg.get(row.id) ?? [],
  }));
}

/**
 * @param {import('@supabase/supabase-js').PostgrestSingleResponse<any>['data']} row
 */
function mapOrgRow(row) {
  return {
    id: row.id,
    name: row.name,
    maxSeats: row.max_seats,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/**
 * @param {string} organizationId
 */
export async function listSeatsForOrganization(organizationId) {
  const supabase = getClient();

  const { data, error } = await supabase
    .from('organization_seats')
    .select('id, phone, active, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new AppError(`Erro ao listar assentos: ${error.message}`, 500);
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    phone: r.phone,
    active: r.active,
    createdAt: r.created_at,
  }));
}

async function getOrganizationOrThrow(organizationId) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    throw new AppError(`Erro ao buscar organização: ${error.message}`, 500);
  }
  if (!data) {
    throw new AppError('Organização não encontrada.', 404);
  }
  if (!data.is_active) {
    throw new AppError('Organização inativa.', 400);
  }
  return data;
}

async function countActiveSeats(organizationId) {
  const supabase = getClient();
  const { count, error } = await supabase
    .from('organization_seats')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('active', true);

  if (error) {
    throw new AppError(`Erro ao contar assentos: ${error.message}`, 500);
  }
  return count ?? 0;
}

/**
 * @param {string} organizationId
 * @param {string} rawPhone
 */
export async function addSeatToOrganization(organizationId, rawPhone) {
  const phone = normalizePhone(String(rawPhone ?? ''));
  if (!phone || phone.length < 8) {
    throw new AppError('Telefone inválido.', 400);
  }

  const org = await getOrganizationOrThrow(organizationId);
  const active = await countActiveSeats(organizationId);
  if (active >= org.max_seats) {
    throw new AppError(`Limite de assentos atingido (${org.max_seats}).`, 400);
  }

  const supabase = getClient();

  const { data: otherSeat, error: eOther } = await supabase
    .from('organization_seats')
    .select('organization_id')
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle();

  if (eOther) {
    throw new AppError(`Erro ao verificar telefone: ${eOther.message}`, 500);
  }
  if (otherSeat && otherSeat.organization_id !== organizationId) {
    throw new AppError('Este número já está em outro plano equipe ativo.', 409);
  }

  const user = await findOrCreateUser(phone);
  if (user.isPaid && user.billingKind === BILLING.PERSONAL) {
    throw new AppError(
      'Este número já é assinante pessoal. Cancele ou ajuste o plano individual antes de vincular ao equipe.',
      409
    );
  }

  const { error: upsertErr } = await supabase.from('organization_seats').upsert(
    {
      organization_id: organizationId,
      phone,
      active: true,
    },
    { onConflict: 'organization_id,phone' }
  );

  if (upsertErr) {
    throw new AppError(`Erro ao registrar assento: ${upsertErr.message}`, 500);
  }

  const { error: updUserErr } = await supabase
    .from('users')
    .update({
      is_paid: true,
      organization_id: organizationId,
      billing_kind: BILLING.TEAM,
    })
    .eq('id', user.id);

  if (updUserErr) {
    throw new AppError(`Erro ao atualizar usuário: ${updUserErr.message}`, 500);
  }

  return { phone, userId: user.id };
}

/**
 * @param {string} organizationId
 * @param {string} rawPhone
 */
export async function removeSeatFromOrganization(organizationId, rawPhone) {
  const phone = normalizePhone(String(rawPhone ?? ''));
  if (!phone) {
    throw new AppError('Telefone inválido.', 400);
  }

  const supabase = getClient();

  const { error: seatErr } = await supabase
    .from('organization_seats')
    .update({ active: false })
    .eq('organization_id', organizationId)
    .eq('phone', phone);

  if (seatErr) {
    throw new AppError(`Erro ao remover assento: ${seatErr.message}`, 500);
  }

  const { data: userRow, error: uErr } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (uErr) {
    throw new AppError(`Erro ao buscar usuário: ${uErr.message}`, 500);
  }

  if (
    userRow &&
    userRow.organization_id === organizationId &&
    userRow.billing_kind === BILLING.TEAM
  ) {
    const { error: updErr } = await supabase
      .from('users')
      .update({
        is_paid: false,
        organization_id: null,
        billing_kind: BILLING.FREE,
      })
      .eq('id', userRow.id);

    if (updErr) {
      throw new AppError(`Erro ao atualizar usuário: ${updErr.message}`, 500);
    }
  }

  return { phone };
}

/**
 * Telefone com assento ativo em alguma organização.
 * @param {string} phone
 */
export async function hasActiveTeamSeatForPhone(phone) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('organization_seats')
    .select('id')
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    throw new AppError(`Erro ao verificar assento: ${error.message}`, 500);
  }
  return Boolean(data);
}
