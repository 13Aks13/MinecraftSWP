import { type INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { createTestApp, getAuthToken } from "./test-helpers.js";

describe("Auth (Contract)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/auth/login returns accessToken for valid credentials", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("role");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toContain("mc_access_token=");
    expect(cookies[0]).toContain("HttpOnly");
  });

  it("POST /api/auth/login rejects invalid credentials", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "wrong-password" })
      .expect(401);
  });

  it("Management endpoints require authentication", async () => {
    await request(app.getHttpServer()).get("/api/server/status").expect(401);
  });

  it("accepts a valid bearer token on management endpoints", async () => {
    const token = await getAuthToken(app);
    const res = await request(app.getHttpServer())
      .get("/api/server/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty("state");
  });

  it("rejects an invalid bearer token", async () => {
    await request(app.getHttpServer())
      .get("/api/server/status")
      .set("Authorization", "Bearer not-a-jwt")
      .expect(401);
  });

  it("authenticates browser sessions with the HttpOnly cookie", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);

    const res = await agent.get("/api/auth/me").expect(200);
    expect(res.body).toMatchObject({ email: "admin@example.com", role: "admin" });
  });

  it("clears the session cookie on logout", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "ChangeMe123!" })
      .expect(200);
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
  });
});
