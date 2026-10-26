import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { getAuthToken } from "./test-helpers.js";

describe("Worlds (Contract)", () => {
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

  it("GET /api/worlds returns list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/worlds")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("POST /api/worlds creates a world", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/worlds")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "test-world", resourcePackIds: [], behaviorPackIds: [] })
      .expect(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("name", "test-world");
  });

  it("DELETE /api/worlds/:id deletes a world", async () => {
    const create = await request(app.getHttpServer())
      .post("/api/v1/worlds")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ name: "delete-world", resourcePackIds: [], behaviorPackIds: [] })
      .expect(201);
    const id = create.body.id;
    await request(app.getHttpServer())
      .delete(`/api/v1/worlds/${id}`)
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
  });
});
