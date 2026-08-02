export function canDeleteDeck(user, ownerId) {
  if (!user.token) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return user.id === ownerId;
}
