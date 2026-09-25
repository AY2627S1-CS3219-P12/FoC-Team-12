export type AuthSession = {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  userId: string;
  username: string;
  role: "USER" | "ADMIN";
};

export const sessionKey = "foc.user-session";

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthSession>;
  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    candidate.tokenType === "Bearer" &&
    typeof candidate.expiresAt === "string" &&
    Number.isFinite(Date.parse(candidate.expiresAt)) &&
    Date.parse(candidate.expiresAt) > Date.now() &&
    typeof candidate.userId === "string" &&
    candidate.userId.length > 0 &&
    typeof candidate.username === "string" &&
    candidate.username.length > 0 &&
    (candidate.role === "USER" || candidate.role === "ADMIN")
  );
}

export function readSession(): AuthSession | null {
  try {
    const value = sessionStorage.getItem(sessionKey);
    if (!value) return null;
    const session: unknown = JSON.parse(value);
    if (isAuthSession(session)) return session;
  } catch {
    // Invalid browser state is cleared below.
  }
  clearSession();
  return null;
}

export function saveSession(session: AuthSession) {
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession() {
  sessionStorage.removeItem(sessionKey);
}

export function safeReturnTo(search = window.location.search): string | null {
  const requested = new URLSearchParams(search).get("returnTo");
  if (!requested || !requested.startsWith("/") || requested.startsWith("//")) {
    return null;
  }

  try {
    const destination = new URL(requested, window.location.origin);
    if (destination.origin !== window.location.origin) return null;
    if (
      destination.pathname === "/suppliers" ||
      destination.pathname.startsWith("/suppliers/") ||
      destination.pathname === "/admin/suppliers" ||
      destination.pathname.startsWith("/admin/suppliers/")
    ) {
      return `${destination.pathname}${destination.search}${destination.hash}`;
    }
  } catch {
    return null;
  }
  return null;
}

export function isAdminDestination(path: string) {
  return path === "/admin/suppliers" || path.startsWith("/admin/suppliers/");
}
