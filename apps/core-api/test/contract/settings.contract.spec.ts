import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DockerMock } from "./docker.mock.js";
import { createTestApp, getAuthToken, getDockerMock } from "./test-helpers.js";

describe("Settings (contract, Docker mocked)", () => {
  let app: INestApplication;
  let docker: DockerMock;
  let auth: [string, string];

  beforeAll(async () => {
    app = await createTestApp();
    docker = getDockerMock(app);
    auth = ["Authorization", `Bearer ${await getAuthToken(app)}`];
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const maxPlayers = (body: Array<{ key: string; value: string }>) =>
    body.find((property) => property.key === "max-players")?.value;

  it("GET /settings/server-properties lists the allow-listed properties", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/settings/server-properties")
      .set(...auth)
      .expect(200);
    const keys = res.body.map((property: { key: string }) => property.key);
    expect(keys).toEqual(expect.arrayContaining(["gamemode", "max-players"]));
  });

  it("PUT updates a value and the next GET returns it", async () => {
    const put = await request(app.getHttpServer())
      .put("/api/v1/settings/server-properties")
      .set(...auth)
      .send({ "max-players": "12" })
      .expect(200);
    expect(maxPlayers(put.body)).toBe("12");

    const get = await request(app.getHttpServer())
      .get("/api/v1/settings/server-properties")
      .set(...auth)
      .expect(200);
    expect(maxPlayers(get.body)).toBe("12");
  });

  it.each([
    ["a key outside the allow-list", { "level-name": "hacked" }],
    ["a nested value", { gamemode: { nested: true } }],
    ["a non-numeric number", { "max-players": "abc" }],
    ["an unknown enum value", { gamemode: "spectator" }],
  ])("PUT rejects %s", async (_name, body) => {
    await request(app.getHttpServer())
      .put("/api/v1/settings/server-properties")
      .set(...auth)
      .send(body)
      .expect(400);
  });

  it("POST /settings/apply restarts the server", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/settings/apply")
      .set(...auth)
      .expect(201);
    expect(res.body).toEqual({ restarted: true });
    expect(docker.restart).toHaveBeenCalledOnce();
  });
});
