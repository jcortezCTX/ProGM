import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "../lib/prisma.js";

export class UnauthorizedError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type PublicUser = {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "manager" | "member";
  has_password: boolean;
  created_at: Date;
};

function toPublicUser(user: {
  id: string;
  email: string;
  display_name: string;
  role: string;
  password_hash: string | null;
  created_at: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role as PublicUser["role"],
    has_password: user.password_hash !== null,
    created_at: user.created_at,
  };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Same generic error for "no such user" and "wrong password" — don't let a
// login attempt reveal whether an email is registered.
export async function login(email: string, password: string) {
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user || !user.password_hash || !(await verifyPassword(password, user.password_hash))) {
    throw new UnauthorizedError("invalid email or password");
  }
  const session = await prisma.sessions.create({
    data: { user_id: user.id, expires_at: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return { token: session.id, user: toPublicUser(user) };
}

export async function logout(token: string): Promise<void> {
  await prisma.sessions.deleteMany({ where: { id: token } });
}

export async function getUserForToken(token: string): Promise<PublicUser> {
  const session = await prisma.sessions.findUnique({ where: { id: token }, include: { users: true } });
  if (!session || session.expires_at < new Date()) {
    throw new UnauthorizedError("session expired or invalid");
  }
  return toPublicUser(session.users);
}

export async function listUsers(): Promise<PublicUser[]> {
  const users = await prisma.users.findMany({ orderBy: { display_name: "asc" } });
  return users.map(toPublicUser);
}

export async function createUser(input: {
  email: string;
  display_name: string;
  role: "admin" | "manager" | "member";
  password: string;
}): Promise<PublicUser> {
  const password_hash = await hashPassword(input.password);
  try {
    const user = await prisma.users.create({
      data: {
        email: input.email,
        display_name: input.display_name,
        role: input.role,
        password_hash,
      },
    });
    return toPublicUser(user);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      throw new ConflictError(`a user with email ${input.email} already exists`);
    }
    throw err;
  }
}

export async function updateUserRole(
  id: string,
  role: "admin" | "manager" | "member",
): Promise<PublicUser> {
  try {
    const user = await prisma.users.update({ where: { id }, data: { role } });
    return toPublicUser(user);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2025") {
      throw new NotFoundError(`user ${id} not found`);
    }
    throw err;
  }
}
