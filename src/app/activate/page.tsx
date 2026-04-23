"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ActivateForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function activate(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setStatus("两次输入的密码不一致");
      return;
    }
    setSaving(true);
    setStatus("启用中...");
    const res = await fetch("/api/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      setSaving(false);
      return;
    }
    setStatus("✓ 已启用，正在登录...");
    await signIn("credentials", { email: json.data.user.email, password, callbackUrl: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>启用账号</CardTitle>
          <CardDescription>设置你的登录密码。启用链接仅可使用一次。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={activate} className="space-y-4">
            {!token && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">缺少启用 token，请确认链接是否完整。</p>}
            <div className="space-y-1.5">
              <Label>新密码</Label>
              <Input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>确认新密码</Label>
              <Input type="password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </div>
            <Button className="w-full" disabled={saving || !token || password.length < 10}>{saving ? "启用中..." : "启用并登录"}</Button>
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center p-4 text-sm text-muted-foreground">正在加载启用页面...</div>}>
      <ActivateForm />
    </Suspense>
  );
}
