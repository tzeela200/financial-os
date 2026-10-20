-- 028 Expense type from the owner's dictionary (approved by the owner 21.10.2026, "2 שלבים", step 2; dictionary: migration 027).
-- After promotion, the server sends one decision per promoted expense document of a Morning export:
--   * a certain match (exact name / alias; an ambiguous name decided by the account key in the file) -> expenses.category_code
--     = the dictionary code. Only a final type is accepted: active, from Green Invoice (not an owner sub-type), not under
--     review. An existing classification is never overwritten.
--   * anything else (unknown, ambiguous, general / composite, conflicting lines) -> category stays empty and one open review
--     item per expense, with the reason and the candidate codes. Nothing is guessed.
-- No rate is stored: rates are read only from green_invoice_expense_types_v, and only when fixed. Income tax and VAT stay
-- separate rules. No foreign key from expenses.category_code (requires the owner's written approval).
-- A separate function, so processing_promote is untouched (026 on the development branch also redefines it).

create or replace function public.processing_classify_expenses(p_document_id uuid, p_items jsonb, p_correlation_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc record;
  v_i jsonb;
  v_id uuid;
  v_code text;
  v_set int := 0;
  v_review int := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select d.id, f.source_id into v_doc
    from public.documents d join public.source_files f on f.id = d.source_file_id
   where d.id = p_document_id and d.owner_user_id = v_uid;
  if v_doc.id is null then raise exception 'NOT_FOUND' using errcode = '22023'; end if;

  for v_i in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    -- the same deterministic id processing_promote gives the expense; only an expense of this user from this source
    v_id := md5(v_uid::text || ':expense:' || (v_i ->> 'key'))::uuid;
    if not exists (select 1 from public.expenses e where e.id = v_id and e.owner_user_id = v_uid and e.primary_source_id = v_doc.source_id) then
      continue;
    end if;
    v_code := nullif(v_i ->> 'category_code', '');
    if v_code is not null then
      if not exists (select 1 from public.green_invoice_expense_types t where t.code = v_code and t.active
                      and t.source = 'green_invoice' and t.parent_id is null and not t.needs_review) then
        raise exception 'VALIDATE_EXPENSE_TYPE' using errcode = '22023';
      end if;
      update public.expenses set category_code = v_code where id = v_id and category_code is null;
      if found then v_set := v_set + 1; end if;
    elsif not exists (select 1 from public.expenses e where e.id = v_id and e.category_code is not null)
      and not exists (select 1 from public.review_queue_items q where q.owner_user_id = v_uid and q.entity_type = 'expense'
                       and q.entity_id = v_id and q.reason_code = v_i ->> 'reason' and q.status in ('open', 'in_review')) then
      if coalesce(v_i ->> 'reason', '') not in ('expense_type_missing', 'expense_type_unknown', 'expense_type_ambiguous',
          'expense_type_key_mismatch', 'expense_type_needs_review', 'expense_type_conflicting_lines') then
        raise exception 'VALIDATE_ENUM' using errcode = '22023';
      end if;
      insert into public.review_queue_items (owner_user_id, item_type, entity_type, entity_id, reason_code, severity, required_action, origin_ref)
      values (v_uid, 'document', 'expense', v_id, v_i ->> 'reason', 'low', 'choose_expense_type',
              jsonb_build_object('document_id', p_document_id, 'name', v_i ->> 'name', 'account_key', v_i ->> 'account_key',
                                 'candidates', coalesce(v_i -> 'candidates', '[]'::jsonb)));
      v_review := v_review + 1;
    end if;
  end loop;

  insert into public.audit_events (owner_user_id, actor_type, action, entity_type, entity_id, after_json, correlation_id)
  values (v_uid, 'system', 'EXPENSE_TYPES_CLASSIFIED', 'document', p_document_id,
          jsonb_build_object('classified', v_set, 'to_review', v_review), p_correlation_id);
  return jsonb_build_object('classified', v_set, 'to_review', v_review);
end $$;

revoke all on function public.processing_classify_expenses(uuid, jsonb, uuid) from public, anon;
grant execute on function public.processing_classify_expenses(uuid, jsonb, uuid) to authenticated;
