"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "DEALER" | "WORKSHOP";
  status: "ACTIVE" | "INACTIVE";
  dealer: { dealerNo: string; companyName: string } | null;
  workshop: { code: string; name: string } | null;
  mustChangePassword: boolean;
  activationTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DealerOption = { id: string; dealerNo: string; companyName: string };
type WorkshopOption = { id: string; code: string; name: string };

const ROLE_LABEL: Record<UserRow["role"], string> = {
  ADMIN: "管理员",
  DEALER: "经销商",
  WORKSHOP: "车间",
};

const ROLE_TONE: Record<UserRow["role"], string> = {
  ADMIN: "bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20",
  DEALER: "bg-teal-500/15 text-teal-300 ring-1 ring-inset ring-teal-400/20",
  WORKSHOP: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20",
};

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

export function UsersManager({
  currentUserId,
  dealers,
  workshops,
  initial,
}: {
  currentUserId: string;
  dealers: DealerOption[];
  workshops: WorkshopOption[];
  initial: UserRow[];
}) {
  const [users, setUsers] = useState(initial);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [latestActivation, setLatestActivation] = useState<{ title: string; link: string } | null>(null);
  const [actionMsg, setActionMsg] = useState("");

  async function toggleStatus(user: UserRow) {
    setActionMsg("");
    const toInactive = user.status === "ACTIVE";
    if (toInactive && !window.confirm(`停用「${user.name}」？停用后无法登录（可随时启用恢复）。`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: toInactive ? "INACTIVE" : "ACTIVE" }),
    });
    const json = await res.json();
    if (json.code !== 0) { setActionMsg("✗ " + json.message); return; }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: json.data.user.status, mustChangePassword: json.data.user.mustChangePassword, updatedAt: json.data.user.updatedAt } : u)));
    if (!toInactive && json.data.activationLink) {
      setLatestActivation({ title: `重新启用·设置密码链接：${user.name}`, link: json.data.activationLink });
      setActionMsg(`✓ 已启用 ${user.name}，请把下方链接发给对方设置新密码`);
    } else {
      setActionMsg(`✓ 已停用 ${user.name}（凭据已作废，无法登录）`);
    }
  }

  async function deleteUser(user: UserRow) {
    setActionMsg("");
    if (!window.confirm(`删除账号「${user.name} ${user.email}」？仅无任何业务/审计记录的账号可删除。`)) return;
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.code !== 0) { setActionMsg("✗ " + json.message); return; }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    setActionMsg(`✓ 已删除 ${user.name}`);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      const scope = [
        user.name,
        user.email,
        user.dealer?.dealerNo,
        user.dealer?.companyName,
        user.workshop?.code,
        user.workshop?.name,
      ].join(" ").toLowerCase();
      return (role === "ALL" || user.role === role) && (!q || scope.includes(q));
    });
  }, [query, role, users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">账号管理</h1>
          <p className="text-sm text-muted-foreground">管理员统一创建三端账号，并为他人重置登录密码。</p>
        </div>
        <Button onClick={() => { setCreating(true); setResetting(null); }}>+ 创建登录账号</Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-4 md:pt-6">
          <Input placeholder="搜索姓名 / 邮箱 / 经销商 / 车间" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="h-10 rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="ALL">全部角色</option>
            <option value="ADMIN">管理员</option>
            <option value="DEALER">经销商</option>
            <option value="WORKSHOP">车间</option>
          </select>
          <div className="flex items-center text-sm text-muted-foreground">
            共 {filtered.length} / {users.length} 个账号
            {actionMsg && <span className="ml-3 text-foreground">{actionMsg}</span>}
          </div>
        </CardContent>
      </Card>

      {latestActivation && <ActivationLinkBox title={latestActivation.title} link={latestActivation.link} />}

      {resetting && (
        <ResetPasswordPanel
          user={resetting}
          onCancel={() => setResetting(null)}
          onReset={({ updatedAt, activationTokenExpiresAt, activationLink }) => {
            setUsers((prev) =>
              prev.map((user) =>
                user.id === resetting.id
                  ? { ...user, mustChangePassword: true, activationTokenExpiresAt, updatedAt }
                  : user,
              ),
            );
            setLatestActivation({ title: `重置密码启用链接：${resetting.name}`, link: activationLink });
            setResetting(null);
          }}
        />
      )}

      {creating && (
        <CreateUserPanel
          dealers={dealers}
          workshops={workshops}
          onCancel={() => setCreating(false)}
          onCreated={(user) => {
            setUsers([user, ...users]);
            if (user.activationLink) {
              setLatestActivation({ title: `新账号启用链接：${user.name}`, link: user.activationLink });
            }
            setCreating(false);
          }}
        />
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b bg-card/40">
              <tr className="text-left">
                <th className="p-3">账号</th>
                <th className="p-3">角色</th>
                <th className="p-3">状态</th>
                <th className="p-3">归属主体</th>
                <th className="p-3">创建时间</th>
                <th className="p-3">最近更新</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id} className="border-b">
                  <td className="p-3">
                    <div className="font-semibold">{user.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{user.email}</div>
                    {user.mustChangePassword && user.status === "ACTIVE" && <div className="mt-1 text-xs text-amber-300">待启用 / 待改密</div>}
                  </td>
                  <td className="p-3">
                    <Badge className={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge>
                  </td>
                  <td className="p-3">
                    {user.status === "ACTIVE"
                      ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300 ring-1 ring-inset ring-emerald-400/20">启用中</span>
                      : <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] text-red-300 ring-1 ring-inset ring-red-400/20">已停用</span>}
                  </td>
                  <td className="p-3">
                    {user.dealer && (
                      <>
                        <div className="font-medium">{user.dealer.companyName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{user.dealer.dealerNo}</div>
                      </>
                    )}
                    {user.workshop && (
                      <>
                        <div className="font-medium">{user.workshop.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{user.workshop.code}</div>
                      </>
                    )}
                    {!user.dealer && !user.workshop && <span className="text-muted-foreground">系统后台</span>}
                  </td>
                  <td className="p-3 text-xs">{formatDate(user.createdAt)}</td>
                  <td className="p-3 text-xs">{formatDate(user.updatedAt)}</td>
                  <td className="p-3 text-right">
                    {user.id === currentUserId ? (
                      <span className="text-xs text-muted-foreground">本人账号</span>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        {user.status === "ACTIVE" && (
                          <Button size="sm" variant="outline" onClick={() => setResetting(user)}>重置密码</Button>
                        )}
                        <Button
                          size="sm"
                          variant={user.status === "ACTIVE" ? "secondary" : "outline"}
                          onClick={() => toggleStatus(user)}
                        >
                          {user.status === "ACTIVE" ? "停用" : "启用"}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/15" onClick={() => deleteUser(user)}>删除</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">没有匹配账号。</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CreateUserPanel({
  dealers,
  workshops,
  onCancel,
  onCreated,
}: {
  dealers: DealerOption[];
  workshops: WorkshopOption[];
  onCancel: () => void;
  onCreated: (user: UserRow & { activationLink?: string }) => void;
}) {
  const [role, setRole] = useState<UserRow["role"]>("WORKSHOP");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dealerId, setDealerId] = useState("");
  const [workshopId, setWorkshopId] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function create() {
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          name,
          email,
          password,
          dealerId: role === "DEALER" ? dealerId : null,
          workshopId: role === "WORKSHOP" ? workshopId : null,
        }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage("✗ " + json.message);
        return;
      }
      const user = json.data.user;
      onCreated({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status ?? "ACTIVE",
        dealer: user.dealer,
        workshop: user.workshop,
        mustChangePassword: user.mustChangePassword,
        activationTokenExpiresAt: user.activationTokenExpiresAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        activationLink: json.data.activationLink,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-4 pt-5 md:pt-6">
        <div>
          <h2 className="text-lg font-bold">创建登录账号</h2>
          <p className="text-sm text-muted-foreground">
            供应商当前仅作为内部主数据使用；经销商和车间需要登录时，在这里创建账号并发送初始密码。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>角色</Label>
            <select className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={role} onChange={(e) => setRole(e.target.value as UserRow["role"])}>
              <option value="WORKSHOP">车间</option>
              <option value="DEALER">经销商</option>
              <option value="ADMIN">管理员</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>姓名</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="联系人姓名" />
          </div>
          <div className="space-y-1.5">
            <Label>登录邮箱</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </div>
          {role === "DEALER" && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>绑定经销商档案</Label>
              <select className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
                <option value="">请选择经销商</option>
                {dealers.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>{dealer.dealerNo} · {dealer.companyName}</option>
                ))}
              </select>
            </div>
          )}
          {role === "WORKSHOP" && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>绑定加工车间</Label>
              <select className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
                <option value="">请选择车间</option>
                {workshops.map((workshop) => (
                  <option key={workshop.id} value={workshop.id}>{workshop.code} · {workshop.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5 md:col-span-2">
            <Label>初始密码</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => setPassword(generatePassword())}>生成强密码</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={create}
            disabled={saving || !name || !email || password.length < 10 || (role === "DEALER" && !dealerId) || (role === "WORKSHOP" && !workshopId)}
          >
            {saving ? "创建中..." : "创建账号"}
          </Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          {message && <span className="text-sm text-muted-foreground">{message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function ResetPasswordPanel({
  user,
  onCancel,
  onReset,
}: {
  user: UserRow;
  onCancel: () => void;
  onReset: (result: { updatedAt: string; activationTokenExpiresAt: string | null; activationLink: string }) => void;
}) {
  const [password, setPassword] = useState(generatePassword());
  const [confirmPassword, setConfirmPassword] = useState(password);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function reset() {
    setMessage("");
    if (password !== confirmPassword) {
      setMessage("两次输入的新密码不一致");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage("✗ " + json.message);
        return;
      }
      setMessage("✓ 已生成新临时密码和启用链接。对方可用链接设置密码，或用临时密码登录后强制改密。");
      onReset({
        updatedAt: json.data.user.updatedAt,
        activationTokenExpiresAt: json.data.user.activationTokenExpiresAt,
        activationLink: json.data.activationLink,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/10">
      <CardContent className="space-y-4 pt-5 md:pt-6">
        <div>
          <h2 className="text-lg font-bold">重置密码：{user.name}</h2>
          <p className="text-sm text-muted-foreground">{user.email} · {ROLE_LABEL[user.role]}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label>新密码</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>确认新密码</Label>
            <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={() => {
              const next = generatePassword();
              setPassword(next);
              setConfirmPassword(next);
            }}>
              生成强密码
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={reset} disabled={saving || password.length < 10}>
            {saving ? "重置中..." : "确认重置"}
          </Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          {message && <span className="text-sm text-muted-foreground">{message}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivationLinkBox({ title = "一次性启用链接", link }: { title?: string; link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-card/80 p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="break-all font-mono text-xs text-muted-foreground">{link}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={copy}>{copied ? "已复制" : "复制链接"}</Button>
        <span className="text-xs text-muted-foreground">链接 7 天内有效，只能使用一次。</span>
      </div>
    </div>
  );
}
