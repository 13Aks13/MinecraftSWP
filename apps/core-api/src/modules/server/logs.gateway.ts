import { SOCKET_EVENTS } from "@mc/shared";
import { Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Socket } from "socket.io";
import { TokenService } from "../auth/token.service.js";
import { UsersService } from "../users/users.service.js";
import { ServerService } from "./server.service.js";
import { extractSocketToken } from "./socket-token.js";

interface LogSocketData {
  stopStream?: () => void;
}

@WebSocketGateway({
  namespace: "/logs",
  cors: { origin: true, credentials: true },
})
export class LogsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(LogsGateway.name);

  constructor(
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(ServerService) private readonly server: ServerService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    if (!this.isOriginAllowed(client)) {
      this.logger.warn(`Rejected /logs connection from origin ${client.handshake.headers.origin}`);
      client.emit(SOCKET_EVENTS.logError, { message: "Origin not allowed" });
      client.disconnect(true);
      return;
    }

    const token = this.extractToken(client);
    if (!token) {
      client.emit(SOCKET_EVENTS.logError, { message: "Authentication token is required" });
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.tokenService.verifyAccessToken(token);
      const user = await this.usersService.findById(payload.sub);
      if (!user?.isActive || (payload.tv ?? 0) !== user.tokenVersion) {
        throw new Error("Inactive user");
      }
    } catch {
      client.emit(SOCKET_EVENTS.logError, { message: "Invalid or expired token" });
      client.disconnect(true);
      return;
    }

    try {
      const stop = await this.server.streamLogs((line) => {
        client.emit(SOCKET_EVENTS.logLine, line);
      });
      (client.data as LogSocketData).stopStream = stop;
      client.emit(SOCKET_EVENTS.logStatus, { connected: true });
    } catch (error) {
      this.logger.warn(`Cannot attach log stream: ${(error as Error).message}`);
      client.emit(SOCKET_EVENTS.logError, { message: (error as Error).message });
    }
  }

  handleDisconnect(client: Socket): void {
    (client.data as LogSocketData).stopStream?.();
  }

  /** Blocks cross-site WebSocket hijacking: browsers always send Origin on a handshake. */
  private isOriginAllowed(client: Socket): boolean {
    const origin = client.handshake.headers.origin;
    if (!origin) {
      return true; // not a browser (curl, server-side client); still needs a valid token
    }

    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    if (originHost === client.handshake.headers.host) {
      return true; // same-origin
    }

    const allowed = this.config
      .get<string>("CORS_ORIGINS", "")
      .split(",")
      .map((item) => item.trim().replace(/\/$/, ""))
      .filter(Boolean);
    return allowed.includes(origin.replace(/\/$/, ""));
  }

  private extractToken(client: Socket): string | null {
    return extractSocketToken(client.handshake);
  }
}
