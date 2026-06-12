interface Session {
  token?: string;
  expiresAt: number;
}

export function isSessionActive(session: Session, now: number): boolean {
  if (!session.token) {
    return false;
  }

  return session.expiresAt > now;
}
