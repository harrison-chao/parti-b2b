import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const workshop = await prisma.workshop.upsert({
    where: { code: "WS-A" },
    update: {},
    create: {
      code: "WS-A",
      name: "车间 A",
      contactName: "王师傅",
      contactPhone: "13800000000",
      isActive: true,
    },
  });
  console.log(`✓ workshop: ${workshop.code} (${workshop.id})`);

  const email = "workshop@parti.test";
  const password = "123456";
  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: "WORKSHOP",
      workshopId: workshop.id,
      password: hash,
    },
    create: {
      email,
      name: "车间 A 操作员",
      password: hash,
      role: "WORKSHOP",
      workshopId: workshop.id,
    },
  });
  console.log(`✓ user: ${user.email} (role=${user.role}, workshopId=${user.workshopId})`);
  console.log("---");
  console.log(`登录: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
