import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { getAuthToken } from "./test-helpers.js";

describe("Backups (Contract)", () => {
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

  it("GET /api/backups returns list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/backups")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe("Config (Contract)", () => {
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

  it("GET /api/config returns settings", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/config")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body).toHaveProperty("settings");
  });

  it("PUT /api/config updates settings", async () => {
    const res = await request(app.getHttpServer())
      .put("/api/v1/config")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ "server-name": "updated" })
      .expect(200);
    expect(res.body).toHaveProperty("settings");
  });
});
