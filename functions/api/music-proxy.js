import musicAPI from "../../src/api/music.js";

const API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";

// 允许的安全响应头
const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
  "expires"
];

// 创建 CORS 响应头
function createCorsHeaders(init = null) {
  const headers = new Headers();
  
  if (init) {
    for (const [key, value] of init.entries()) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
  }
  
  // 默认不缓存
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  
  // 添加 CORS 头
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  
  return headers;
}

// 处理 OPTIONS 预检请求
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400"
    }
  });
}

// 代理音频文件
async function proxyAudioFile(targetUrl, request) {
  try {
    const url = new URL(decodeURIComponent(targetUrl));
    
    // 验证协议
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return new Response("Invalid protocol", { status: 400 });
    }
    
    const init = {
      method: request.method,
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
        "Referer": "https://music-api.gdstudio.xyz/"
      }
    };
    
    // 传递 Range 头用于流式播放
    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      init.headers["Range"] = rangeHeader;
    }
    
    const upstream = await fetch(url.toString(), init);
    const headers = createCorsHeaders(upstream.headers);
    
    // 音频文件设置缓存
    if (!headers.has("Cache-Control")) {
      headers.set("Cache-Control", "public, max-age=3600");
    }
    
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers
    });
  } catch (error) {
    console.error("Audio proxy error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// 代理 API 请求
async function proxyApiRequest(url, request, env) {
  try {
    // 初始化数据库
    musicAPI.initDatabase(env);
    
    // 构建 API 请求 URL
    const apiUrl = new URL(API_BASE_URL);
    
    // 复制查询参数（排除 target 和 callback）
    url.searchParams.forEach((value, key) => {
      if (key !== "target" && key !== "callback") {
        apiUrl.searchParams.set(key, value);
      }
    });
    
    // 验证必要参数
    if (!apiUrl.searchParams.has("types")) {
      return new Response(JSON.stringify({ error: "Missing types parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 获取查询参数用于后续处理
    const types = apiUrl.searchParams.get("types");
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const count = parseInt(url.searchParams.get("count") || "20", 10);
    
    // 添加超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const upstream = await fetch(apiUrl.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
        "Accept": "application/json"
      }
    });
    
    clearTimeout(timeoutId);
    
    // 处理响应
    const headers = createCorsHeaders(upstream.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json; charset=utf-8");
    }
    
    // 检查状态码
    if (!upstream.ok) {
      return new Response(JSON.stringify({
        error: `API Error: ${upstream.status} ${upstream.statusText}`
      }), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 解析并可能转换响应
    let data;
    try {
      data = await upstream.json();
    } catch (parseError) {
      return new Response(JSON.stringify({ error: "Failed to parse API response" }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 搜索请求格式转换
    if (types === "search") {
      if (Array.isArray(data)) {
        data = {
          songs: data,
          page: page,
          total_pages: Math.ceil((data.length || 0) / count),
          total: data.length || 0
        };
      }
    }
    
    // 设置缓存策略
    if (types === "search") {
      headers.set("Cache-Control", "public, max-age=300");
    } else if (types === "url" || types === "lyric" || types === "pic") {
      headers.set("Cache-Control", "public, max-age=3600");
    }
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers
    });
  } catch (error) {
    let statusCode = 500;
    let errorMessage = error.message;
    
    if (error.name === "AbortError") {
      statusCode = 504;
      errorMessage = "Request timeout";
    } else if (error instanceof TypeError) {
      statusCode = 502;
      errorMessage = "Network error";
    }
    
    console.error("API proxy error:", errorMessage, error);
    
    return new Response(JSON.stringify({
      error: errorMessage,
      timestamp: new Date().toISOString()
    }), {
      status: statusCode,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export default {
  async onRequest(context) {
    const { request, env } = context;
    
    // 处理 OPTIONS 预检请求
    if (request.method === "OPTIONS") {
      return handleOptions();
    }
    
    // 只允许 GET 和 HEAD 请求
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    
    const url = new URL(request.url);
    const target = url.searchParams.get("target");
    
    // 如果有 target 参数，代理音频文件
    if (target) {
      return proxyAudioFile(target, request);
    }
    
    // 否则代理 API 请求
    return proxyApiRequest(url, request, env);
  }
};