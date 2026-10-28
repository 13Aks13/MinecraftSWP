import type Docker from "dockerode";

/**
 * DOCKER_HOST (tcp://host:2375, http(s)://host:port or unix:///path) takes precedence over
 * DOCKER_SOCKET. It lets core-api talk to a docker-socket-proxy instead of mounting
 * /var/run/docker.sock directly.
 */
export function buildDockerOptions(
  dockerHost: string | undefined,
  socketPath: string,
): Docker.DockerOptions {
  const value = dockerHost?.trim();
  if (!value) {
    return { socketPath };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`DOCKER_HOST must be a URL such as tcp://docker-proxy:2375, got "${value}"`);
  }

  switch (url.protocol) {
    case "unix:":
      return { socketPath: url.pathname };
    case "tcp:":
    case "http:":
      return { host: url.hostname, port: Number(url.port || 2375), protocol: "http" };
    case "https:":
      return { host: url.hostname, port: Number(url.port || 2376), protocol: "https" };
    default:
      throw new Error(`Unsupported DOCKER_HOST protocol "${url.protocol}"`);
  }
}
