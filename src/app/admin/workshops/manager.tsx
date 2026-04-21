"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type WorkshopUser = { id: string; email: string; name: string; createdAt: string };
type Workshop = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  isActive: boolean;
  workOrderCount: number;
  userCount: number;
  users: WorkshopUser[];
  createdAt: string;
};

export function WorkshopsManager({ initial }: { initial: Workshop[] }) {
  const router = useRouter();
  const [workshops, setWorkshops] = useState(initial);
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">加工车间管理</h1>
          <p className="text-sm text-muted-foreground">维护车间档案、负责人账号</p>
        </div>
        <Button onClick={() => { setCreating(true); setEditing(null); }}>+ 新增车间</Button>
      </div>

      {(creating || editing) && (
        <WorkshopForm
          workshop={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={(w, isNew) => {
            if (isNew) setWorkshops([{ ...w, users: [], userCount: 0, workOrderCount: 0 }, ...workshops]);
            else setWorkshops(workshops.map((x) => x.id === w.id ? { ...x, ...w } : x));
            setCreating(false); setEditing(null);
            router.refresh();
          }}
        />
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">编号</th><th className="p-3">名称</th>
              <th className="p-3">负责人</th><th className="p-3">地址</th>
              <th className="p-3">账号</th><th className="p-3">加工单</th>
              <th className="p-3">状态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {workshops.map((w) => (
                <>
                  <tr key={w.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">{w.code}</td>
                    <td className="p-3 font-medium">{w.name}</td>
                    <td className="p-3">{w.contactName ?? "-"}<div className="text-xs text-muted-foreground">{w.contactPhone ?? ""}</div></td>
                    <td className="p-3 text-xs max-w-xs truncate">{w.address ?? "-"}</td>
                    <td className="p-3">{w.userCount}</td>
                    <td className="p-3">{w.workOrderCount}</td>
                    <td className="p-3"><Badge className={w.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>{w.isActive ? "启用" : "停用"}</Badge></td>
                    <td className="p-3 flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}>
                        {expandedId === w.id ? "收起" : "账号"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setEditing(w); setCreating(false); }}>编辑</Button>
                    </td>
                  </tr>
                  {expandedId === w.id && (
                    <tr className="bg-amber-50 border-b">
                      <td colSpan={8} className="p-4">
                        <UserPanel
                          workshop={w}
                          onUserAdded={(u) => {
                            setWorkshops((prev) => prev.map((x) => x.id === w.id ? { ...x, users: [u, ...x.users], userCount: x.userCount + 1 } : x));
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {workshops.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无车间，点击右上角新增</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkshopForm({ workshop, onCancel, onSaved }: {
  workshop: Workshop | null;
  onCancel: () => void;
  onSaved: (w: any, isNew: boolean) => void;
}) {
  const [code, setCode] = useState(workshop?.code ?? "");
  const [name, setName] = useState(workshop?.name ?? "");
  const [contactName, setContactName] = useState(workshop?.contactName ?? "");
  const [contactPhone, setContactPhone] = useState(workshop?.contactPhone ?? "");
  const [address, setAddress] = useState(workshop?.address ?? "");
  const [isActive, setIsActive] = useState(workshop?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError(""); setSaving(true);
    try {
      const url = workshop ? `/api/workshops/${workshop.id}` : "/api/workshops";
      const method = workshop ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, contactName, contactPhone, address, isActive }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      onSaved({
        id: j.data.id,
        code, name, contactName, contactPhone, address, isActive,
        workOrderCount: workshop?.workOrderCount ?? 0,
        userCount: workshop?.userCount ?? 0,
        createdAt: workshop?.createdAt ?? new Date().toISOString(),
      }, !workshop);
    } finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{workshop ? "编辑车间" : "新增车间"}</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <div><Label>车间编号</Label><Input value={code} disabled={!!workshop} onChange={(e) => setCode(e.target.value)} placeholder="WS-01" /></div>
        <div><Label>车间名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>负责人</Label><Input value={contactName ?? ""} onChange={(e) => setContactName(e.target.value)} /></div>
        <div><Label>联系电话</Label><Input value={contactPhone ?? ""} onChange={(e) => setContactPhone(e.target.value)} /></div>
        <div className="col-span-2"><Label>地址</Label><Input value={address ?? ""} onChange={(e) => setAddress(e.target.value)} /></div>
        <div>
          <Label>状态</Label>
          <select className="border rounded h-10 px-2 text-sm w-full" value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")}>
            <option value="1">启用</option>
            <option value="0">停用</option>
          </select>
        </div>
        {error && <p className="col-span-2 text-sm text-destructive">{error}</p>}
        <div className="col-span-2 flex gap-3 pt-2">
          <Button onClick={submit} disabled={saving}>{saving ? "保存中..." : (workshop ? "保存修改" : "创建")}</Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UserPanel({ workshop, onUserAdded }: { workshop: Workshop; onUserAdded: (u: WorkshopUser) => void }) {
  const [users, setUsers] = useState(workshop.users);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setError(""); setSaving(true);
    try {
      const r = await fetch(`/api/workshops/${workshop.id}/users`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      const u: WorkshopUser = { id: j.data.id, email: j.data.email, name: j.data.name, createdAt: j.data.createdAt };
      setUsers([u, ...users]);
      onUserAdded(u);
      setEmail(""); setName(""); setPassword("");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{workshop.name} · 车间账号</div>
      <div className="grid grid-cols-4 gap-2">
        <Input placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="姓名" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="密码 (≥6 位)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button onClick={add} disabled={saving || !email || !name || !password}>{saving ? "添加中..." : "添加账号"}</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="border rounded bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-slate-50"><tr className="text-left">
            <th className="p-2">姓名</th><th className="p-2">邮箱</th><th className="p-2">创建时间</th>
          </tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b"><td className="p-2">{u.name}</td><td className="p-2 font-mono">{u.email}</td><td className="p-2">{formatDate(u.createdAt)}</td></tr>
            ))}
            {users.length === 0 && <tr><td colSpan={3} className="p-3 text-center text-muted-foreground">尚无账号</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
