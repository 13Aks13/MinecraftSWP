import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, getAuthToken } from "./test-helpers.js";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("Backups (contract)", () => {
  let app: INestApplication;
  let auth: [string, string];

  beforeAll(async () => {
    app = await createTestApp();
    auth = ["Authorization", `Bearer ${await getAuthToken(app)}`];
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /backups returns a paginated list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/backups")
      .set(...auth)
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body).toHaveProperty("total");
  });

  it.each(["limit=1000", "page=0", "page=abc"])("GET /backups rejects %s", async (query) => {
    await request(app.getHttpServer())
      .get(`/api/v1/backups?${query}`)
      .set(...auth)
      .expect(400);
  });

  it("POST /backups for an unknown world returns 404", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/backups")
      .set(...auth)
      .send({ worldId: UNKNOWN_ID })
      .expect(404);
  });

  it("POST /backups/:id/restore validates the ids and reports unknown backups", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/backups/not-a-uuid/restore")
      .set(...auth)
      .send({ worldId: UNKNOWN_ID })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/backups/${UNKNOWN_ID}/restore`)
      .set(...auth)
      .send({ worldId: "nope" })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/backups/${UNKNOWN_ID}/restore`)
      .set(...auth)
      .send({ worldId: UNKNOWN_ID })
      .expect(404);
  });
});
