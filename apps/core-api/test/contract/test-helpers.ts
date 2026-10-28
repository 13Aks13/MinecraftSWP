import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module.js";
import { ApiExceptionFilter } from "../../src/common/filters/api-exception.filter.js";
import { DockerService } from "../../src/modules/server/docker.service.js";
import { createDockerMock, type DockerMock } from "./docker.mock.js";

/** Boots the real AppModule (real Postgres) with the Docker layer replaced by a mock. */
export async function createTestApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DockerService)
    .useValue(createDockerMock())
    .compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix("api/v1");
  // Same validation and error format as main.ts.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.init();
  return app;
}

/** The DockerService instance replaced by createTestApp(), typed as the mock. */
export function getDockerMock(app: INestApplication): DockerMock {
  return app.get(DockerService) as unknown as DockerMock;
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
