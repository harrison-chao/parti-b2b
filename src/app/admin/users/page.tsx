import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UsersManager } from "./users-manager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    include: {
      dealer: { select: { dealerNo: true, companyName: true } },
      workshop: { select: { code: true, name: true } },
    },
  });
  const [dealers, workshops] = await Promise.all([
    prisma.dealer.findMany({
      where: { status: "ACTIVE" },
      orderBy: { dealerNo: "asc" },
      select: { id: true, dealerNo: true, companyName: true },
    }),
    prisma.workshop.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <UsersManager
      currentUserId={session!.user.id}
      dealers={dealers}
      workshops={workshops}
      initial={users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        dealer: user.dealer ? { dealerNo: user.dealer.dealerNo, companyName: user.dealer.companyName } : null,
        workshop: user.workshop ? { code: user.workshop.code, name: user.workshop.name } : null,
        mustChangePassword: user.mustChangePassword,
        activationTokenExpiresAt: user.activationTokenExpiresAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      }))}
    />
  );
}
