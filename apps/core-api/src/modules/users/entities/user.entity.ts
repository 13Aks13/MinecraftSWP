import type { UserRole } from "@mc/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 320, unique: true })
  email!: string;

  @Column({ name: "password_hash", type: "varchar", length: 255, select: false })
  passwordHash!: string;

  @Column({ type: "varchar", length: 20, default: "admin" })
  role!: UserRole;

  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  /** Bumped on every password change; tokens carrying an older value are rejected. */
  @Column({ name: "token_version", type: "int", default: 0 })
  tokenVersion!: number;

  @Column({ name: "last_login_at", type: "timestamptz", nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
