import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, getAuthToken, getTestCredentials } from "./test-helpers.js";

describe("Auth (Contract)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /api/v1/auth/login returns accessToken for valid credentials", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send(getTestCredentials())
      .expect(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("role");

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toContain("mc_access_token=");
    expect(cookies[0]).toContain("HttpOnly");
  });

  it("POST /api/v1/auth/login rejects invalid credentials", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: getTestCredentials().email, password: "wrong-password" })
      .expect(401);
  });

  it("Management endpoints require authentication", async () => {
    await request(app.getHttpServer()).get("/api/v1/server/status").expect(401);
  });

  it("accepts a valid bearer token on management endpoints", async () => {
    const token = await getAuthToken(app);
    const res = await request(app.getHttpServer())
      .get("/api/v1/server/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveProperty("state");
  });

  it("rejects an invalid bearer token", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/server/status")
      .set("Authorization", "Bearer not-a-jwt")
      .expect(401);
  });

  it("authenticates browser sessions with the HttpOnly cookie", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/v1/auth/login").send(getTestCredentials()).expect(200);

    const res = await agent.get("/api/v1/auth/me").expect(200);
    expect(res.body).toMatchObject({ email: getTestCredentials().email, role: "admin" });
  });

  it("clears the session cookie on logout", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/v1/auth/login").send(getTestCredentials()).expect(200);
    await agent.post("/api/v1/auth/logout").expect(204);
    await agent.get("/api/v1/auth/me").expect(401);
  });
});
