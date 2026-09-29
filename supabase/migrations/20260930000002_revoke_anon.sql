-- 002 revoke anonymous access (18D §28, §56: unauthenticated read must be blocked)
-- Personal system: the anon role never needs direct table/function access.
-- Defense in depth on top of RLS (RLS alone returns empty sets to anon).
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables    from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
