import request from "supertest";
import { createApp } from "../app";

describe("user routes", () => {
  it("returns 400 for invalid user input", async () => {
    await request(createApp()).post("/users").send({}).expect(400);
  });
});
