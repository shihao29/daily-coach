import { NextResponse } from "next/server";

export const runtime = "edge";

const SYSTEM = `你是“朝夕”的轻量周报分析员。你只能分析用户提供的客观打卡数据，不能进行健康诊断、医疗建议或泛用聊天。不要编造任何数字；如果数据不足就明确说不足。daily 中 active=false 的日期表示项目当时尚未生效，不得计入完成率。用简洁、温和但直接的中文回答，输出四段：本周亮点、需要注意、你可能忽略的规律、下周建议。每个判断尽量引用输入中的项目和数字。追问也只能围绕这份周报和对应数据回答。`;

export async function POST(request: Request) {
  const key = process.env.SILICONFLOW_API_KEY;
  if (!key)
    return NextResponse.json({ error: "AI 服务尚未配置" }, { status: 503 });
  let body: {
    action?: string;
    period?: unknown;
    metrics?: unknown;
    report?: unknown;
    question?: string;
  };
  try {
    const raw = await request.text();
    if (raw.length > 40_000)
      return NextResponse.json({ error: "提交的数据过多" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (body.action !== "generate" && body.action !== "follow_up")
    return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  if (
    body.action === "follow_up" &&
    (!body.question?.trim() || body.question.length > 300)
  )
    return NextResponse.json(
      { error: "问题不能为空且不能超过 300 字" },
      { status: 400 },
    );
  if (body.action === "generate" && !Array.isArray(body.metrics))
    return NextResponse.json({ error: "缺少周报统计数据" }, { status: 400 });
  if (body.action === "follow_up") {
    const report = body.report as { followUps?: unknown[] } | undefined;
    if (Array.isArray(report?.followUps) && report.followUps.length >= 5)
      return NextResponse.json(
        { error: "这份周报已达到 5 次追问上限" },
        { status: 429 },
      );
  }
  const userContent =
    body.action === "generate"
      ? JSON.stringify({ period: body.period, metrics: body.metrics })
      : JSON.stringify({ report: body.report, question: body.question });
  try {
    const response = await fetch(
      "https://api.siliconflow.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: process.env.SILICONFLOW_MODEL || "deepseek-ai/DeepSeek-V4-Pro",
          temperature: 0.35,
          max_tokens: 900,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userContent },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: string | { message?: string };
    };
    if (!response.ok) {
      if (response.status === 401)
        return NextResponse.json(
          { error: "AI 服务密钥无效，请更新服务端配置" },
          { status: 503 },
        );
      const providerError =
        typeof data.error === "string" ? data.error : data.error?.message;
      return NextResponse.json(
        { error: providerError || "模型服务暂时不可用" },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }
    return NextResponse.json({
      content: data.choices?.[0]?.message?.content || "这次没有得到有效周报。",
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "网络暂时不可用，请稍后重试" },
      { status: 502 },
    );
  }
}
