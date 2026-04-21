import { notFound } from "next/navigation";
import { loadWorkOrderDetail } from "@/lib/workorder-loader";
import { WorkOrderPrint } from "@/components/work-order-print";
import { prisma } from "@/lib/prisma";

export default async function AdminWorkOrderPrintPage({ params }: { params: { workOrderNo: string } }) {
  const data = await loadWorkOrderDetail(params.workOrderNo, { includeDealer: true });
  if (!data) notFound();
  await prisma.workOrder.update({
    where: { workOrderNo: params.workOrderNo },
    data: { printedAt: new Date() },
  }).catch(() => null);
  return <WorkOrderPrint data={data} />;
}
