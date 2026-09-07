// Role → dashboard base path. Single source used by routing and the
// login redirect (Header.tsx keeps its local copy for now).
export function roleHome(role: string | null | undefined): string {
  switch (role) {
    case 'admin': return '/admin';
    case 'supervisor': return '/supervisor';
    case 'operator': return '/operator';
    default: return '/login';
  }
}
