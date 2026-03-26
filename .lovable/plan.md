

## Problem: Admin actions hang with infinite spinner

Multiple admin operations (creating content types, saving settings, etc.) get stuck showing a spinning loader that never stops. The save mutations call Supabase but the response never comes back — no error toast appears either, meaning the request itself hangs rather than failing.

## Root Cause

The Supabase client calls have **no timeout**. If the network request stalls (due to token refresh issues, network hiccups, or Supabase connection problems), the `mutationFn` promise never resolves or rejects, leaving `isPending` as `true` forever.

Additionally, there's no **error boundary or timeout logic** in any mutation — if the Supabase SDK silently fails to return, the UI is stuck.

## Plan

### 1. Add a global request timeout wrapper

Create a utility function that wraps any async operation with a timeout (e.g., 15 seconds). If the operation doesn't complete in time, it rejects with a clear error message.

**File:** `src/lib/withTimeout.ts` (new)

```typescript
export async function withTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Request timed out. Please try again.")), ms)
  );
  return Promise.race([promise, timeout]);
}
```

### 2. Apply timeout to ContentTypeEditor save mutation

Wrap the Supabase insert/update call in `withTimeout()` so the Create button stops spinning after 15 seconds with an error toast instead of spinning forever.

**File:** `src/components/admin/ContentTypeEditor.tsx` (lines 172-207)

### 3. Apply timeout to other hanging mutations

Apply the same `withTimeout` wrapper to save mutations in:
- `SiteSettingsManager.tsx`
- `NichesManager.tsx`
- `PillarPageEditor.tsx`
- `PostEditor.tsx`
- `GeneratedPagesManager.tsx` (OG image generation, link building, etc.)

### 4. Add auth session refresh before mutations

Add a proactive `supabase.auth.getSession()` call before critical mutations to ensure the auth token is fresh, preventing silent auth-related hangs.

### 5. Fix the forwardRef console warning

The `Field` component in `ContentTypeEditor.tsx` (line ~1656) is a function component receiving a ref. Wrap it with `React.forwardRef` to eliminate the console warning.

## Technical Details

- The `withTimeout` wrapper uses `Promise.race` — standard pattern for adding timeouts to promises
- 15-second timeout is generous enough for normal DB operations but catches true hangs
- The error will flow through `onError` in the mutation, showing a toast automatically
- Auth session refresh adds ~50ms but prevents the most common cause of silent hangs

