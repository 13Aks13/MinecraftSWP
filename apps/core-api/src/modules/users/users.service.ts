import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import bcrypt from "bcryptjs";
import type { Repository } from "typeorm";
import { UserEntity } from "./entities/user.entity.js";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ADMIN_PASSWORD = "ChangeMe123!";

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.users.count();
    if (count > 0) {
      return;
    }

    const email = this.config.get<string>("ADMIN_EMAIL", "admin@example.com").toLowerCase();
    const password = this.config.get<string>("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD);
    if (
      this.config.get<string>("NODE_ENV") === "production" &&
      password === DEFAULT_ADMIN_PASSWORD
    ) {
      throw new Error(
        "Refusing to create the first admin with the default password in production: set ADMIN_PASSWORD in .env",
      );
    }
    const user = this.users.create({
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: "admin",
      isActive: true,
    });
    await this.users.save(user);
    this.logger.warn(
      `Created initial admin account "${email}". Change ADMIN_PASSWORD and rotate it after first login.`,
    );
  }

  findByEmailWithPassword(email: string): Promise<UserEntity | null> {
    return this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("lower(user.email) = lower(:email)", { email })
      .getOne();
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOneBy({ id });
  }

  /** password_hash is `select: false`, so it must be requested explicitly. */
  findByIdWithPassword(id: string): Promise<UserEntity | null> {
    return this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :id", { id })
      .getOne();
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  async markLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }

  async setPassword(id: string, plain: string): Promise<void> {
    await this.users.update(
      { id },
      {
        passwordHash: await bcrypt.hash(plain, BCRYPT_ROUNDS),
        // Invalidates every token issued before this change.
        tokenVersion: () => "token_version + 1",
      },
    );
  }
}
