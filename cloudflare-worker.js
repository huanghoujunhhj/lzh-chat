/**
 * Cloudflare Worker：把请求转发到阿里云 DashScope（通义千问），并补上浏览器需要的 CORS 头。
 *
 * 为什么要它：
 *   阿里云 DashScope 服务器不返回 Access-Control-Allow-Origin，浏览器直连会被 CORS 拦截，
 *   所以纯静态网页必须经一个你自己部署的代理来转发请求。
 *
 * 怎么用：
 *   1. 打开 https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. 把本文件全部代码粘贴进去 → Deploy
 *   3. 得到地址：https://你的子域名.workers.dev
 *   4. 回到 lzh-chat 的「设置」，把 API Base URL 填成：
 *        https://你的子域名.workers.dev/compatible-mode/v1
 *      模型 qwen-vl-max，API Key 填你的千问 Key，保存并点「测试连接」。
 *
 * 安全说明：Key 仍然只存在你浏览器的设置里，经 Authorization 头透传，
 * 代理本身不存储任何密钥。请勿把这个 Worker 地址公开分享给不信任的人。
 */
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };

  // 浏览器跨域预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const target = 'https://dashscope.aliyuncs.com' + url.pathname + url.search;

  const upstream = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });

  const headers = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(upstream.body, { status: upstream.status, headers });
}
