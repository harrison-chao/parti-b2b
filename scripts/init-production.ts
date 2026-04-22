import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main() {
  const email = requireEnv("INIT_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("INIT_ADMIN_PASSWORD");
  const name = process.env.INIT_ADMIN_NAME?.trim() || "系统管理员";

  if (password.length < 10) {
    throw new Error("INIT_ADMIN_PASSWORD must be at least 10 characters");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: passwordHash,
      role: "ADMIN",
      dealerId: null,
      workshopId: null,
    },
    create: {
      email,
      name,
      password: passwordHash,
      role: "ADMIN",
    },
    select: {
      email: true,
      name: true,
      role: true,
    },
  });

  await prisma.systemSetting.upsert({
    where: { key: "production_initialized" },
    update: {
      value: { initializedAt: new Date().toISOString(), adminEmail: email },
      updatedBy: email,
    },
    create: {
      key: "production_initialized",
      value: { initializedAt: new Date().toISOString(), adminEmail: email },
      updatedBy: email,
    },
  });

  console.log("Production admin initialized.");
  console.table([admin]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
