import { buildDockerOptions } from "./docker.options.js";

const SOCKET = "/var/run/docker.sock";

describe("buildDockerOptions", () => {
  it("falls back to the socket path when DOCKER_HOST is empty", () => {
    expect(buildDockerOptions(undefined, SOCKET)).toEqual({ socketPath: SOCKET });
    expect(buildDockerOptions("  ", SOCKET)).toEqual({ socketPath: SOCKET });
  });

  it("parses a tcp URL as plain HTTP", () => {
    expect(buildDockerOptions("tcp://docker-proxy:2375", SOCKET)).toEqual({
      host: "docker-proxy",
      port: 2375,
      protocol: "http",
    });
  });

  it("uses default ports", () => {
    expect(buildDockerOptions("tcp://proxy", SOCKET)).toMatchObject({ port: 2375 });
    expect(buildDockerOptions("https://proxy", SOCKET)).toMatchObject({
      port: 2376,
      protocol: "https",
    });
  });

  it("parses a unix URL", () => {
    expect(buildDockerOptions("unix:///run/docker.sock", SOCKET)).toEqual({
      socketPath: "/run/docker.sock",
    });
  });

  it("rejects garbage and unknown protocols", () => {
    expect(() => buildDockerOptions("not a url", SOCKET)).toThrow(/DOCKER_HOST must be a URL/);
    expect(() => buildDockerOptions("ftp://proxy:21", SOCKET)).toThrow(/Unsupported/);
  });
});
