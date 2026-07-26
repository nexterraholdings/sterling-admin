import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createMockClient() {
  console.warn(
    "[supabase] SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL not fully configured — using mock client for local development."
  );

  const makeQuery = () => {
    const q: any = {};
    const noop = (..._args: any[]) => q;
    q.select    = noop;
    q.order     = noop;
    q.limit     = noop;
    q.range     = noop;
    q.eq        = noop;
    q.neq       = noop;
    q.gt        = noop;
    q.gte       = noop;
    q.lt        = noop;
    q.lte       = noop;
    q.is        = noop;
    q.not       = noop;
    q.or        = noop;
    q.in        = noop;
    q.ilike     = noop;
    q.filter    = noop;
    q.contains  = noop;
    q.maybeSingle = async () => ({ count: 0, data: null, error: null });
    q.single      = async () => ({ data: null, error: null });
    q.insert      = async () => ({ data: null, error: null });
    q.update      = async () => ({ data: null, error: null });
    q.delete      = async () => ({ data: null, error: null });
    // make the query itself awaitable → returns empty result
    q.then = (resolve: (v: any) => any) => Promise.resolve({ data: [], count: 0, error: null }).then(resolve);
    return q;
  };

  return {
    from: (_table: string) => makeQuery(),
    rpc: async (_fn: string, _args?: Record<string, unknown>) => ({ data: null, error: null }),
    auth: {
      admin: {
        deleteUser: async (_id: string) => ({ data: null, error: null }),
        getUserById: async (_id: string) => ({
          data: { user: null },
          error: { message: "User not found", status: 404 },
        }),
        listUsers: async () => ({
          data: { users: [] },
          error: null,
        }),
      },
    },
  } as any;
}

let supabaseAdmin: any;
let supabaseAdminIsMock = false;

if (supabaseUrl && supabaseServiceRoleKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  supabaseAdminIsMock = false;
} else if (supabaseUrl && supabaseAnonKey) {
  console.warn(
    "[supabase] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key. Admin-only operations will be restricted."
  );
  supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
  supabaseAdminIsMock = false;
} else {
  // As a last resort, provide a mock client so the app can run in local dev without crashing.
  supabaseAdmin = createMockClient();
  supabaseAdminIsMock = true;
}

export { supabaseAdmin, supabaseAdminIsMock };
