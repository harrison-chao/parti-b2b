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

  function fill(kind: "admin" | "ops" | "dealer") {
    const map = {
      admin: ["admin@parti.com", "admin123"],
      ops: ["ops@parti.com", "ops123"],
      dealer: ["dealer@parti.com", "dealer123"],
    };
    setEmail(map[kind][0]);
    setPassword(map[kind][1]);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Parti B2B ERP</CardTitle>
          <CardDescription>经销商管理系统 — 模块一</CardDescription>
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
          <div className="mt-6 pt-4 border-t space-y-2">
            <p className="text-xs text-muted-foreground">演示账号（点击快速填入）:</p>
            <div className="flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant="outline" onClick={() => fill("admin")}>管理员</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => fill("ops")}>运营</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => fill("dealer")}>经销商</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
