import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LEVEL_DISCOUNT } from "@/lib/pricing";
import { formatMoney } from "@/lib/utils";

export default async function CatalogPage() {
  const session = await auth();
  const dealer = session!.user.dealerId
    ? await prisma.dealer.findUnique({ where: { id: session!.user.dealerId! } })
    : null;
  const level = dealer?.priceLevel ?? "E";
  const discount = LEVEL_DISCOUNT[level];

  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ series: "asc" }, { lengthInch: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">产品目录</h1>
          <p className="text-muted-foreground text-sm">
            MR2525 商用线槽系列 · 您的价格等级 <Badge className="bg-emerald-100 text-emerald-700">{level}</Badge> (折扣 {(discount * 100).toFixed(0)}%)
          </p>
        </div>
        <Link href="/dealer/orders/new"><Button>创建订单</Button></Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => {
          const retail = Number(p.retailPrice);
          const yours = Math.round(retail * discount * 100) / 100;
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-base">{p.productName}</CardTitle>
                <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">系列</span><span>{p.series}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">长度</span><span>{Number(p.lengthInch)}" ({Number(p.lengthMm)}mm)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">零售价</span><span>{formatMoney(retail)}</span></div>
                <div className="flex justify-between border-t pt-2 text-emerald-700 font-semibold">
                  <span>您的采购价</span>
                  <span>{formatMoney(yours)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
