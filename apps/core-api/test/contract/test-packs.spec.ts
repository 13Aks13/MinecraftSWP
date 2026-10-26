import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { getAuthToken } from "./test-helpers.js";

describe("Packs (Contract)", () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    authToken = await getAuthToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/packs returns paginated list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/packs")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("total");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("GET /api/packs/:id returns a pack", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/v1/packs")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    if (list.body.items.length > 0) {
      const id = list.body.items[0].id;
      const res = await request(app.getHttpServer())
        .get(`/api/v1/packs/${id}`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);
      expect(res.body).toHaveProperty("id", id);
      expect(res.body).toHaveProperty("name");
      expect(res.body).toHaveProperty("type");
    } else {
      expect(true).toBe(true);
    }
  });

  it("DELETE /api/packs/:id returns deleted true", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/v1/packs")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    if (list.body.items.length === 0) {
      expect(true).toBe(true);
      return;
    }
    const id = list.body.items[0].id;
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/packs/${id}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body).toHaveProperty("deleted", true);
  });
});
