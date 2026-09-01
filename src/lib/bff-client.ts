// =====================================================================
// bff-client.ts
//
// Client-side helper for calling the Backend-for-Frontend (BFF) service.
// All auth.admin operations MUST go through the BFF to keep the
// service-role key server-side only.
//
// The BFF exposes:
//   POST   /api/auth-admin/users            — createUser
//   GET    /api/auth-admin/users            — listUsers (paged)
//   PATCH  /api/auth-admin/users/:id        — updateUserById
//   DELETE /api/auth-admin/users/:id        — deleteUser
//   POST   /api/auth-admin/users/:id/password — reset password
//
// Every call carries the current user's access token in the
// Authorization header. The BFF validates the token and confirms the
// caller has an active admin profile before executing any operation.
// =====================================================================

const BFF_URL = import.meta.env.VITE_BFF_URL || 'http://localhost:10000';

interface BFFError {
  error: string;
  detail?: string;
}

interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}

interface ListUsersResponse {
  users: AuthUser[];
  total?: number;
}

interface CreateUserResponse {
  id: string;
  user: AuthUser;
}

interface UpdateUserResponse {
  id: string;
  user: AuthUser;
}

async function bffFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('authentication_required');
  }

  const url = `${BFF_URL}${path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json() as T | BFFError;

  if (!response.ok) {
    const errorMessage = (data as BFFError).error || 'bff_request_failed';
    throw new Error(errorMessage);
  }

  return data as T;
}

export async function listUsers(page = 1, perPage = 100): Promise<ListUsersResponse> {
  return bffFetch<ListUsersResponse>(`/api/auth-admin/users?page=${page}&perPage=${perPage}`);
}

export interface CreateUserInput {
  email: string;
  password: string;
  role?: string;
  username?: string;
  email_confirm?: boolean;
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResponse> {
  return bffFetch<CreateUserResponse>('/api/auth-admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface UpdateUserInput {
  password?: string;
  role?: string;
  username?: string;
  email?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
}

export async function updateUserById(userId: string, input: UpdateUserInput): Promise<UpdateUserResponse> {
  return bffFetch<UpdateUserResponse>(`/api/auth-admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteUser(userId: string): Promise<{ ok: boolean }> {
  return bffFetch<{ ok: boolean }>(`/api/auth-admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function resetPassword(userId: string, password: string): Promise<{ ok: boolean }> {
  return bffFetch<{ ok: boolean }>(`/api/auth-admin/users/${encodeURIComponent(userId)}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}
