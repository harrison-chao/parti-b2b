/** 飞书群机器人通知（W2b）：env FEISHU_WEBHOOK_URL 未配置时静默跳过，不阻塞主流程 */
export async function notifyFeishu(title: string, lines: string[]): Promise<void> {
  const url = process.env.FEISHU_WEBHOOK_URL;
  if (!url) return;
  try {
    const text = [`【${title}】`, ...lines].join("\n");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
    });
  } catch (e) {
    console.error("feishu notify failed:", e);
  }
}
