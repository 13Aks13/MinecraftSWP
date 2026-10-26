import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { getAuthToken } from "./test-helpers.js";

describe("Logs (Contract)", () => {
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

  it("GET /api/server/logs returns log text", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/server/logs")
      .set("Authorization", `Bearer ${authToken}`)
      .expect(200);
    expect(typeof res.body).toBe("string");
  });
});
