import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StampForm } from "./stamp-form";

export const dynamic = "force-dynamic";

export default async function DealerSettingsPage() {
  const session = await auth();
  const dealer = await prisma.dealer.findUnique({ where: { id: session!.user.dealerId! } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">合同章设置</h1>
        <p className="text-muted-foreground text-sm">上传合同章用于报价单 PDF 加盖</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>报价合同章</CardTitle>
          <CardDescription>
            建议透明底 PNG，320×320 像素以上。导出客户报价单 PDF 时将自动加盖。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StampForm initialUrl={dealer?.stampUrl ?? null} companyName={dealer?.companyName ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
