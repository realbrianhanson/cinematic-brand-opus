## What's actually broken

The password isn't the real problem. The network log shows you already signed in successfully at 07:16:44 and 07:16:54 (HTTP 200 on `/auth/v1/token`). The failure that follows is:

```
GET /rest/v1/user_roles?...role=eq.admin  → 403
{ "code": "42501", "message": "permission denied for function is_admin" }
```

The admin UI signs you in, then reads `user_roles` to confirm the `admin` role. That table's RLS policy is `is_admin(auth.uid())`. A previous security-hardening migration revoked `EXECUTE` on `public.is_admin(uuid)` from `authenticated`, so the policy check itself throws a permission error — the client sees "not admin" and bounces you back to the login screen.

DB state confirms it:

```
is_admin | anon          | can_exec = t
is_admin | authenticated | can_exec = f   ← this is the bug
is_admin | service_role  | can_exec = t
```

Anonymous visitors can execute it (needed for public "published OR is_admin" policies), but signed-in admins cannot — exactly backwards for the admin panel.

The later 07:17:31 `400 invalid_credentials` was you retrying with `12345678`, which isn't your real password. The two earlier 200s prove your real password still works.

## The fix

One migration that restores `EXECUTE` on `public.is_admin(uuid)` to `authenticated` (keeping the existing grants to `anon` and `service_role`). No app-code change.

```sql
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
```

After it runs:

1. Sign in with the password that worked at 07:16:44 (not `12345678`).
2. `user_roles` lookup returns your `admin` row.
3. Admin panel loads.

## About the security finding

This does not reopen the finding I ignored earlier. `is_admin` is a hardened, `STABLE`, fixed-`search_path` existence check against `user_roles` — safe to expose EXECUTE to both `anon` and `authenticated`. I'll update the security memory note to say authenticated is also required, so no future scan or agent re-revokes it.

## If you truly forgot the password

Separate from the fix above. Two options, pick one after the admin panel loads:

- Use the "Forgot password" flow on `/admin/login` (sends a reset email to `brian@aiforbusiness.com`).
- Or, once logged in, use the existing Change Password screen in the admin.

I don't have a way to set your password directly from here (the service-role admin API isn't exposed on Lovable Cloud), so it has to go through one of those flows.

## Files touched

- New migration: `supabase/migrations/<timestamp>_restore_is_admin_execute_authenticated.sql`
- `security-memory` note updated so this grant isn't re-revoked.

Nothing else changes.