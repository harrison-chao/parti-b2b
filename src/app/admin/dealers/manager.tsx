"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate } from "@/lib/utils";

type Dealer = {
  id: string;
  dealerNo: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  priceLevel: string;
  creditLimit: number;
  creditBalance: number;
  paymentMethod: string;
  status: string;
  orderCount: number;
  createdAt: string;
};

const PAYMENT_LABELS: Record<string, string> = { PREPAID: "预付款", DEPOSIT: "定金", CREDIT: "信用额度" };

export function DealersManager({ initial }: { initial: Dealer[] }) {
  const router = useRouter();
  const [dealers, setDealers] = useState(initial);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">经销商管理</h1>
          <p className="text-sm text-muted-foreground">维护经销商信息、等级与结算配置</p>
        </div>
        <Button onClick={() => { setCreating(true); setEditing(null); }}>+ 新增经销商</Button>
      </div>

      {(creating || editing) && (
        <DealerForm
          dealer={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={(d, isNew) => {
            if (isNew) setDealers([d, ...dealers]);
            else setDealers(dealers.map((x) => x.id === d.id ? { ...x, ...d } : x));
            setCreating(false); setEditing(null);
            router.refresh();
          }}
        />
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">编号</th><th className="p-3">公司</th><th className="p-3">联系人</th>
              <th className="p-3">等级</th><th className="p-3">结算方式</th>
              <th className="p-3 text-right">信用额度</th><th className="p-3 text-right">可用</th>
              <th className="p-3">订单数</th><th className="p-3">注册</th><th className="p-3">状态</th>
              <th className="p-3"></th>
            </tr></thead>
            <tbody>
              {dealers.map((d) => (
                <tr key={d.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono">{d.dealerNo}</td>
                  <td className="p-3 font-medium">{d.companyName}</td>
                  <td className="p-3">{d.contactName}<div className="text-xs text-muted-foreground">{d.contactPhone}</div></td>
                  <td className="p-3"><Badge className="bg-slate-100 text-slate-700">{d.priceLevel}</Badge></td>
                  <td className="p-3 text-xs">{PAYMENT_LABELS[d.paymentMethod] ?? d.paymentMethod}</td>
                  <td className="p-3 text-right">{formatMoney(d.creditLimit)}</td>
                  <td className="p-3 text-right text-emerald-700">{formatMoney(d.creditBalance)}</td>
                  <td className="p-3">{d.orderCount}</td>
                  <td className="p-3">{formatDate(d.createdAt)}</td>
                  <td className="p-3"><Badge className={d.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>{d.status}</Badge></td>
                  <td className="p-3"><Button variant="outline" size="sm" onClick={() => { setEditing(d); setCreating(false); }}>编辑</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function DealerForm({ dealer, onCancel, onSaved }: {
  dealer: Dealer | null;
  onCancel: () => void;
  onSaved: (d: any, isNew: boolean) => void;
}) {
  const [dealerNo, setDealerNo] = useState(dealer?.dealerNo ?? "");
  const [companyName, setCompanyName] = useState(dealer?.companyName ?? "");
  const [contactName, setContactName] = useState(dealer?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(dealer?.contactPhone ?? "");
  const [priceLevel, setPriceLevel] = useState(dealer?.priceLevel ?? "E");
  const [creditLimit, setCreditLimit] = useState(dealer?.creditLimit ?? 0);
  const [paymentMethod, setPaymentMethod] = useState(dealer?.paymentMethod ?? "PREPAID");
  const [status, setStatus] = useState(dealer?.status ?? "ACTIVE");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError(""); setSaving(true);
    try {
      const url = dealer ? `/api/dealers/${dealer.id}` : "/api/dealers";
      const method = dealer ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealerNo, companyName, contactName, contactPhone,
          priceLevel, creditLimit: Number(creditLimit), paymentMethod, status,
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      onSaved({
        id: j.data.id,
        dealerNo, companyName, contactName, contactPhone,
        priceLevel, creditLimit: Number(creditLimit),
        creditBalance: dealer ? j.data.creditBalance : Number(creditLimit),
        paymentMethod, status,
        orderCount: dealer?.orderCount ?? 0,
        createdAt: dealer?.createdAt ?? new Date().toISOString(),
      }, !dealer);
    } finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{dealer ? "编辑经销商" : "新增经销商"}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <div><Label>经销商编号</Label><Input value={dealerNo} disabled={!!dealer} onChange={(e) => setDealerNo(e.target.value)} placeholder="PARTI-D-0002" /></div>
        <div><Label>公司名称</Label><Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
        <div><Label>联系人</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
        <div><Label>联系电话</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} /></div>
        <div>
          <Label>价格等级</Label>
          <select className="border rounded h-10 px-2 text-sm w-full" value={priceLevel} onChange={(e) => setPriceLevel(e.target.value)}>
            {["A","B","C","D","E"].map((lv) => <option key={lv} value={lv}>{lv}</option>)}
          </select>
        </div>
        <div>
          <Label>结算方式</Label>
          <select className="border rounded h-10 px-2 text-sm w-full" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="PREPAID">预付款</option>
            <option value="DEPOSIT">定金</option>
            <option value="CREDIT">信用额度</option>
          </select>
        </div>
        <div><Label>信用额度（元）</Label><Input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)} /></div>
        <div>
          <Label>状态</Label>
          <select className="border rounded h-10 px-2 text-sm w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">启用</option>
            <option value="INACTIVE">停用</option>
          </select>
        </div>
        {error && <p className="col-span-2 text-sm text-destructive">{error}</p>}
        <div className="col-span-2 flex gap-3 pt-2">
          <Button onClick={submit} disabled={saving}>{saving ? "保存中..." : (dealer ? "保存修改" : "创建")}</Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  );
}
