"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error || !res?.ok) {
      setLoading(false);
      setError("邮箱或密码错误");
      return;
    }
    window.location.href = "/";
  }

  function fill(kind: "admin" | "dealer") {
    const map = {
      admin: ["admin@parti.com", "admin123"],
      dealer: ["dealer@parti.com", "dealer123"],
    };
    setEmail(map[kind][0]);
    setPassword(map[kind][1]);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="absolute left-8 top-10 hidden max-w-xl md:block">
        <div className="mb-6 inline-flex rounded-full border border-white/70 bg-white/65 px-4 py-2 text-xs font-bold uppercase tracking-[0.28em] text-teal-800 shadow-sm backdrop-blur">
          Parti Operations
        </div>
        <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.06em] text-slate-950">
          经销、采购、车间履约一条线管理
        </h1>
        <p className="mt-5 max-w-md text-sm leading-7 text-slate-600">
          从报价下单到派工生产，再到库存扣减、盘点和应收应付对账，统一在一个轻量 ERP 中闭环。
        </p>
      </div>
      <Card className="relative z-10 w-full max-w-md border-white/80 bg-white/82 shadow-[0_30px_90px_-35px_rgba(15,23,42,0.55)]">
        <CardHeader>
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-700 to-amber-500 text-lg font-black text-white shadow-lg shadow-teal-900/20">
            P
          </div>
          <CardTitle className="text-3xl">Parti B2B ERP</CardTitle>
          <CardDescription>经销商、管理员、车间协同工作台</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>
          <div className="mt-6 space-y-2 border-t border-slate-900/10 pt-4">
            <p className="text-xs text-muted-foreground">演示账号（点击快速填入）:</p>
            <div className="flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant="outline" onClick={() => fill("admin")}>管理员</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => fill("dealer")}>经销商</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
