import { readFile } from "node:fs/promises";
import path from "node:path";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DockerMock } from "./docker.mock.js";
import { createTestApp, getAuthToken, getDockerMock } from "./test-helpers.js";

describe("Worlds (contract, Docker mocked)", () => {
  let app: INestApplication;
  let docker: DockerMock;
  let auth: [string, string];
  const name = `contract-${Date.now()}`;
  const created: string[] = [];
  let worldId = "";

  beforeAll(async () => {
    app = await createTestApp();
    docker = getDockerMock(app);
    auth = ["Authorization", `Bearer ${await getAuthToken(app)}`];
  });

  afterAll(async () => {
    // Best-effort cleanup of everything this file created.
    for (const id of created) {
      await request(app.getHttpServer())
        .post(`/api/v1/worlds/${id}/deactivate`)
        .set(...auth);
      await request(app.getHttpServer())
        .delete(`/api/v1/worlds/${id}`)
        .set(...auth);
    }
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /worlds returns a paginated list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/worlds")
      .set(...auth)
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it.each([
    ["a slash in the name", { name: "a/b" }],
    ["an unknown game mode", { name: "x", gamemode: "hardcore" }],
    ["an unknown field", { name: "x", extra: 1 }],
    [
      "a non-existent pack",
      { name: "x", resourcePackIds: ["00000000-0000-4000-8000-000000000000"] },
    ],
  ])("POST /worlds rejects %s", async (_label, body) => {
    await request(app.getHttpServer())
      .post("/api/v1/worlds")
      .set(...auth)
      .send(body)
      .expect(400);
  });

  it("creates a world and rejects a duplicate name", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/worlds")
      .set(...auth)
      .send({
        name,
        gamemode: "creative",
        difficulty: "hard",
        resourcePackIds: [],
        behaviorPackIds: [],
      })
      .expect(201);
    expect(res.body).toMatchObject({ name, gamemode: "creative", status: "ready" });
    worldId = res.body.id;
    created.push(worldId);

    await request(app.getHttpServer())
      .post("/api/v1/worlds")
      .set(...auth)
      .send({ name })
      .expect(409);
  });

  it("clones the world under a new name", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/worlds/${worldId}/clone`)
      .set(...auth)
      .expect(201);
    expect(res.body.name).toBe(`${name} Copy`);
    expect(res.body.id).not.toBe(worldId);
    created.push(res.body.id);
  });

  it("activates the world: stops and starts Docker and applies its settings", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/worlds/${worldId}/activate`)
      .set(...auth)
      .expect(201);
    expect(res.body.status).toBe("active");
    expect(docker.stop).toHaveBeenCalled();
    expect(docker.start).toHaveBeenCalled();

    const properties = await readFile(
      path.join(process.env.DATA_ROOT ?? "", "server.properties"),
      "utf8",
    );
    expect(properties).toContain("gamemode=creative");
    expect(properties).toContain("difficulty=hard");
  });

  it("refuses to delete the active world, then deactivates and deletes it", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/worlds/${worldId}`)
      .set(...auth)
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/v1/worlds/${worldId}/deactivate`)
      .set(...auth)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/worlds/${worldId}`)
      .set(...auth)
      .expect(200);
  });
});
