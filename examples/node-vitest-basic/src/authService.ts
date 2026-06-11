interface User {
  id: string;
  role: "admin" | "member";
  token?: string;
}

export function canDeleteDeck(user: User, ownerId: string): boolean {
  if (!user.token) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return user.id === ownerId;
}
