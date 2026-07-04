/**
 * Cookie parsing helpers shared across auth and user handlers.
 *
 * Extracted from handlers/auth.ts and handlers/user.ts to eliminate
 * the duplicated parseAuthCookie implementation (code review L3).
 */

/** Parse the `token` value from the request's Cookie header. */
export function parseAuthCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('token=')) {
      const value = trimmed.slice(6);
      // Remove surrounding quotes if present.
      if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
      return value || null;
    }
  }
  return null;
}

/** Build a Set-Cookie header value for the JWT token. */
export function setTokenCookie(token: string, maxAge: number): string {
  return `token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=${maxAge}`;
}
