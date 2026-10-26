import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { getAuthToken } from "./test-helpers.js";

describe("ServerLifecycle (Contract)", () => {
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

  it("GET /api/server/status returns server status", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/server/status")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(res.body).toHaveProperty("exists");
    expect(res.body).toHaveProperty("state");
  });

  it("POST /api/server/start returns 202", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/server/start")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(202);
    expect(res.body).toBeUndefined();
  });

  it("POST /api/server/stop returns 202", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/server/stop")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(202);
    expect(res.body).toBeUndefined();
  });

  it("POST /api/server/restart returns 202", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/server/restart")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(202);
    expect(res.body).toBeUndefined();
  });
});
