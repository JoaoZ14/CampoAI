-- Usuários que já usaram o WhatsApp antes do cadastro obrigatório:
-- marcamos signup como concluído e trial de 14 dias a partir da criação.

update public.users
set
  signup_completed_at = coalesce(signup_completed_at, created_at),
  trial_started_at = coalesce(trial_started_at, created_at),
  trial_ends_at = coalesce(trial_ends_at, created_at + interval '14 days'),
  signup_source = coalesce(signup_source, 'legacy_whatsapp')
where
  is_paid = false
  and signup_completed_at is null
  and usage_count > 0;

-- Assinantes pagos: consideramos cadastro concluído (entraram pelo checkout).
update public.users
set
  signup_completed_at = coalesce(signup_completed_at, created_at),
  signup_source = coalesce(signup_source, 'legacy_checkout')
where
  is_paid = true
  and signup_completed_at is null;
