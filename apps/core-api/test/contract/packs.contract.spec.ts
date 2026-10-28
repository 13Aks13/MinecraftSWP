import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, getAuthToken } from "./test-helpers.js";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

describe("Packs (contract)", () => {
  let app: INestApplication;
  let auth: [string, string];

  beforeAll(async () => {
    app = await createTestApp();
    auth = ["Authorization", `Bearer ${await getAuthToken(app)}`];
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /packs returns a paginated list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/packs")
      .set(...auth)
      .expect(200);
    expect(res.body).toMatchObject({ page: 1, limit: 50 });
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("rejects out-of-range pagination and an unknown type filter", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/packs?limit=1000")
      .set(...auth)
      .expect(400);
    await request(app.getHttpServer())
      .get("/api/v1/packs?type=world")
      .set(...auth)
      .expect(400);
  });

  it("GET /packs/:id validates the UUID and reports unknown packs", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/packs/not-a-uuid")
      .set(...auth)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/packs/${UNKNOWN_ID}`)
      .set(...auth)
      .expect(404);
  });

  it("DELETE /packs refuses to delete everything implicitly", async () => {
    await request(app.getHttpServer())
      .delete("/api/v1/packs")
      .set(...auth)
      .expect(400);
    await request(app.getHttpServer())
      .delete("/api/v1/packs?all=yes")
      .set(...auth)
      .expect(400);
    await request(app.getHttpServer())
      .delete("/api/v1/packs")
      .set(...auth)
      .send({ ids: ["nope"] })
      .expect(400);
  });

  it("DELETE /packs/:id reports unknown packs and rejects a bad force flag", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/packs/${UNKNOWN_ID}`)
      .set(...auth)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/packs/${UNKNOWN_ID}?force=1`)
      .set(...auth)
      .expect(400);
  });

  it("POST /packs/import requires a file and a valid type", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/packs/import")
      .set(...auth)
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/packs/import?type=world")
      .set(...auth)
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/packs/import?type=resource")
      .set(...auth)
      .expect(400);
  });
});
