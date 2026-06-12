interface CreateUserRequest {
  email?: string;
  role?: "admin" | "member";
}

export async function createUser(request: CreateUserRequest) {
  if (!request.email) {
    throw new Error("Email is required.");
  }

  return {
    id: `user_${Date.now()}`,
    email: request.email,
    role: request.role ?? "member"
  };
}
