import { ACCESS_TOKEN_COOKIE } from "../auth/auth.constants.js";
import { extractSocketToken } from "./socket-token.js";

describe("extractSocketToken", () => {
  it("reads auth.token", () => {
    expect(extractSocketToken({ auth: { token: "a" }, headers: {} })).toBe("a");
  });

  it("reads a Bearer header", () => {
    expect(extractSocketToken({ headers: { authorization: "Bearer b" } })).toBe("b");
  });

  it("reads the session cookie", () => {
    const cookie = `other=1; ${ACCESS_TOKEN_COOKIE}=c`;
    expect(extractSocketToken({ headers: { cookie } })).toBe("c");
  });

  it("prefers auth.token over the header and the cookie", () => {
    const handshake = {
      auth: { token: "a" },
      headers: { authorization: "Bearer b", cookie: `${ACCESS_TOKEN_COOKIE}=c` },
    };
    expect(extractSocketToken(handshake)).toBe("a");
  });

  it("ignores a token in the URL query string", () => {
    const handshake = { headers: {}, query: { token: "leaky" } };
    expect(extractSocketToken(handshake)).toBeNull();
  });

  it("returns null for empty or malformed credentials", () => {
    expect(extractSocketToken({ auth: { token: "" }, headers: {} })).toBeNull();
    expect(extractSocketToken({ headers: { authorization: "Bearer   " } })).toBeNull();
    expect(extractSocketToken({ headers: { authorization: "Basic xyz" } })).toBeNull();
    expect(extractSocketToken({ headers: {} })).toBeNull();
  });
});
