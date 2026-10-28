import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DockerMock } from "./docker.mock.js";
import { createTestApp, getAuthToken, getDockerMock } from "./test-helpers.js";

describe("Server (contract, Docker mocked)", () => {
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

  it("GET /health is public and reports every dependency up", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    expect(res.body.status).toBe("ok");
    const names = res.body.checks.map((check: { name: string }) => check.name);
    expect(names).toEqual(expect.arrayContaining(["postgres", "docker", "storage"]));
  });

  it("GET /server/status requires authentication", async () => {
    await request(app.getHttpServer()).get("/api/v1/server/status").expect(401);
  });

  it("GET /server/status returns the container state", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/server/status")
      .set(...auth)
      .expect(200);
    expect(res.body).toMatchObject({ exists: true, state: "running" });
  });

  it.each([
    ["start", "start"],
    ["stop", "stop"],
    ["restart", "restart"],
  ] as const)("POST /server/%s returns 202 and calls Docker once", async (path, method) => {
    await request(app.getHttpServer())
      .post(`/api/v1/server/${path}`)
      .set(...auth)
      .expect(202);
    expect(docker[method]).toHaveBeenCalledOnce();
  });

  it("POST /server/command forwards a valid command", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/server/command")
      .set(...auth)
      .send({ command: "  list " })
      .expect(201);
    expect(res.body).toEqual({ output: "" });
    expect(docker.sendCommand).toHaveBeenCalledWith("list");
  });

  it.each([
    ["empty", { command: "" }],
    ["two lines", { command: "list\nstop" }],
    ["too long", { command: "a".repeat(1001) }],
    ["extra property", { command: "list", extra: true }],
    ["missing", {}],
  ])("POST /server/command rejects %s", async (_name, body) => {
    await request(app.getHttpServer())
      .post("/api/v1/server/command")
      .set(...auth)
      .send(body)
      .expect(400);
    expect(docker.sendCommand).not.toHaveBeenCalled();
  });

  it("GET /server/logs returns text and applies the default tail", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/server/logs")
      .set(...auth)
      .expect(200);
    expect(res.text).toContain("Server started");
    expect(docker.logsText).toHaveBeenCalledWith(500);
  });

  it("GET /server/logs converts the tail and rejects bad values", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/server/logs?tail=2000")
      .set(...auth)
      .expect(200);
    expect(docker.logsText).toHaveBeenCalledWith(2000);

    for (const tail of ["0", "10001", "abc"]) {
      await request(app.getHttpServer())
        .get(`/api/v1/server/logs?tail=${tail}`)
        .set(...auth)
        .expect(400);
    }
  });

  it("manages the allowlist and validates names", async () => {
    const add = await request(app.getHttpServer())
      .post("/api/v1/server/allowlist")
      .set(...auth)
      .send({ name: "Contract_Test", xuid: "" })
      .expect(201);
    expect(add.body.entries.map((entry: { name: string }) => entry.name)).toContain(
      "Contract_Test",
    );

    await request(app.getHttpServer())
      .post("/api/v1/server/allowlist")
      .set(...auth)
      .send({ name: "a/b" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/server/allowlist")
      .set(...auth)
      .send({ name: "Ok", xuid: "123" })
      .expect(400);
    await request(app.getHttpServer())
      .delete("/api/v1/server/allowlist/a%2Fb")
      .set(...auth)
      .expect(400);

    const removed = await request(app.getHttpServer())
      .delete("/api/v1/server/allowlist/Contract_Test")
      .set(...auth)
      .expect(200);
    expect(removed.body.entries.map((entry: { name: string }) => entry.name)).not.toContain(
      "Contract_Test",
    );
  });
});
