"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountSettingsForm({
  initialName,
  initialEmail,
}: {
  initialName: string;
  initialEmail: string;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setMessage("");
    if (newPassword && newPassword !== confirmPassword) {
      setMessage("两次输入的新密码不一致");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          currentPassword,
          newPassword: newPassword || undefined,
        }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setMessage("✗ " + json.message);
        return;
      }

      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");

      if (json.data.shouldRelogin) {
        setMessage("✓ 已保存。邮箱或密码已变更，请重新登录。");
        setTimeout(() => signOut({ callbackUrl: "/login" }), 900);
        return;
      }

      setMessage("✓ 已保存");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="account-name">显示名称</Label>
        <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-email">登录邮箱</Label>
        <Input id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="current-password">当前密码</Label>
        <Input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="修改邮箱或密码时必填"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">新密码</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="留空则不修改，至少 10 位"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">确认新密码</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="再次输入新密码"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button onClick={save} disabled={saving || !name || !email}>
          {saving ? "保存中..." : "保存账号设置"}
        </Button>
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
      </div>
    </div>
  );
}
