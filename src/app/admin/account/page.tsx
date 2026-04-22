import { auth } from "@/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountSettingsForm } from "@/components/account-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">账号设置</h1>
        <p className="text-sm text-muted-foreground">维护管理员自己的登录邮箱、显示名称和密码。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>登录安全</CardTitle>
          <CardDescription>修改邮箱或密码后需要重新登录，以确保会话信息刷新。</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountSettingsForm initialName={session!.user.name} initialEmail={session!.user.email} />
        </CardContent>
      </Card>
    </div>
  );
}
