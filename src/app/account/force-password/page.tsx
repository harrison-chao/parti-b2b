"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForcePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setStatus("两次输入的密码不一致");
      return;
    }
    setSaving(true);
    setStatus("保存中...");
    const res = await fetch("/api/account/force-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      setSaving(false);
      return;
    }
    setStatus("✓ 已更新，正在刷新登录状态...");
    await signIn("credentials", { email: json.data.user.email, password, callbackUrl: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>首次登录请修改密码</CardTitle>
          <CardDescription>为了账号安全，请将管理员分配的临时密码更换为你自己的密码。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label>新密码</Label>
              <Input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>确认新密码</Label>
              <Input type="password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            </div>
            <Button className="w-full" disabled={saving || password.length < 10}>{saving ? "保存中..." : "保存并进入系统"}</Button>
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
