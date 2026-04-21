import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWorkOrderDetail } from "@/lib/workorder-loader";
import { loadSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { WorkOrderDetail } from "@/components/work-order-detail";

export default async function WorkshopOrderDetailPage({ params }: { params: { workOrderNo: string } }) {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");
  const data = await loadWorkOrderDetail(params.workOrderNo, { includeDealer: false });
  if (!data) notFound();
  // Authorization: this workshop owns the work order
  const wo = await prisma.workOrder.findUnique({ where: { workOrderNo: params.workOrderNo }, select: { workshopId: true } });
  if (!wo || wo.workshopId !== session.user.workshopId) notFound();
  const settings = await loadSettings();
  return (
    <WorkOrderDetail
      data={data}
      role="WORKSHOP"
      carriers={settings.carriers}
      printHref={`/workshop/orders/${params.workOrderNo}/print`}
      backHref="/workshop"
    />
  );
}
