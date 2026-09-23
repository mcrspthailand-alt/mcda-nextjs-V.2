export function isAdminEmail(email: string | null | undefined) {
  const normalized = (email ?? '').trim().toLowerCase();
  if (!normalized) return false;
  const allowed = (process.env.MCDA_ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalized);
}
