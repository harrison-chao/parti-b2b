import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWorkOrderDetail } from "@/lib/workorder-loader";
import { WorkOrderPrint } from "@/components/work-order-print";
import { prisma } from "@/lib/prisma";

export default async function WorkshopWorkOrderPrintPage({ params }: { params: { workOrderNo: string } }) {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNo: params.workOrderNo },
    select: { workshopId: true },
  });
  if (!wo || wo.workshopId !== session.user.workshopId) notFound();
  const data = await loadWorkOrderDetail(params.workOrderNo, { includeDealer: false });
  if (!data) notFound();
  await prisma.workOrder.update({
    where: { workOrderNo: params.workOrderNo },
    data: { printedAt: new Date() },
  }).catch(() => null);
  return <WorkOrderPrint data={data} />;
}
