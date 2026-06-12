import { Router } from "express";
import { createUser } from "../services/userService";

export function userRoutes() {
  const router = Router();

  router.post("/users", async (request, response) => {
    if (!request.headers.authorization) {
      response.status(401).json({ error: "Missing authorization." });
      return;
    }

    try {
      const user = await createUser(request.body);
      response.status(201).json(user);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
