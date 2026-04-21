import { notFound } from "next/navigation";
import { loadWorkOrderDetail } from "@/lib/workorder-loader";
import { loadSettings } from "@/lib/settings";
import { WorkOrderDetail } from "@/components/work-order-detail";

export default async function AdminWorkOrderDetailPage({ params }: { params: { workOrderNo: string } }) {
  const [data, settings] = await Promise.all([
    loadWorkOrderDetail(params.workOrderNo, { includeDealer: true }),
    loadSettings(),
  ]);
  if (!data) notFound();
  return (
    <WorkOrderDetail
      data={data}
      role="ADMIN"
      carriers={settings.carriers}
      printHref={`/admin/work-orders/${params.workOrderNo}/print`}
      backHref="/admin/work-orders"
    />
  );
}
