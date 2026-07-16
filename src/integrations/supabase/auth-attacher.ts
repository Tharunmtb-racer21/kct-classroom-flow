import { createMiddleware } from '@tanstack/react-start'

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    try {
      const { auth } = await import('@/lib/firebase');
      const token = await auth.currentUser?.getIdToken();
      return next({
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    } catch (e) {
      console.error('[auth-attacher] Failed to retrieve Firebase ID Token:', e);
      return next({
        headers: {}
      });
    }
  },
)
