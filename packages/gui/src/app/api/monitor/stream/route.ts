/**
 * SSE 透传路由 - /api/monitor/stream
 *
 * Next.js 15 的 rewrites 代理会缓冲流式响应, 导致浏览器 EventSource
 * 收不到实时事件 (curl 却能收到)。此 Route Handler 用 Node 原生
 * fetch 透传引擎的 SSE 流, 不做缓冲。
 *
 * Route Handler 匹配优先级高于 rewrites, 因此该路由会覆盖 rewrites 中的
 * /api/:path* 规则, 其余 REST API 仍走 rewrites 代理。
 */

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function GET() {
  const upstream = await fetch(`${ENGINE_URL}/api/monitor/stream`, {
    headers: { Accept: 'text/event-stream' },
    // Node fetch (undici) 不自动解压, 保持流的原始字节
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('engine stream unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // 禁止中间层缓冲
      'X-Accel-Buffering': 'no',
    },
  });
}
