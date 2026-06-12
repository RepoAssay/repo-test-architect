import express from "express";
import { userRoutes } from "./routes/userRoutes";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(userRoutes());
  return app;
}
