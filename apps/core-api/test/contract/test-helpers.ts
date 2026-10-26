import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";

export async function createTestApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export function getTestCredentials(): { email: string; password: string } {
  return {
    email: process.env.ADMIN_EMAIL ?? "admin@example.com",
    password: process.env.ADMIN_PASSWORD ?? "ChangeMe123!",
  };
}

export async function getAuthToken(
  app: INestApplication,
  email = getTestCredentials().email,
  password = getTestCredentials().password,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, password })
    .expect(200);
  return res.body.accessToken;
}
