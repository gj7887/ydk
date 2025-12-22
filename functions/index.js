// 主 Worker 入口文件
// 使用 ES module 格式以支持 D1 数据库绑定

// 导入 API 路由处理程序
import verifyPasswordHandler from './api/verify-password.js';
import musicProxyHandler from './api/music-proxy.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        
        // 处理 API 路由
        if (pathname === '/api/verify-password') {
            return verifyPasswordHandler.onRequest({ request, env });
        }
        
        if (pathname === '/api/music-proxy') {
            return musicProxyHandler.onRequest({ request, env });
        }
        
        // 确定是否需要认证和当前是否为登录页面
        const isLoginPath = pathname === '/login' || pathname === '/login.html';
        const isRootOrIndex = pathname === '/' || pathname === '/index.html';
        
        // 检查是否需要密码保护
        const requiresAuth = env.PASSWORD && !isLoginPath;
        
        // 检查认证状态
        if (requiresAuth) {
            const cookieHeader = request.headers.get('Cookie') || '';
            const isAuthenticated = cookieHeader.includes('authenticated=true');
            
            if (!isAuthenticated) {
                // 未认证，重定向到登录页面
                return new Response(null, {
                    status: 302,
                    headers: {
                        'Location': '/login.html'
                    }
                });
            }
        }
        
        // 处理登录页面请求
        if (isLoginPath) {
            const loginResponse = await env.ASSETS.fetch(new Request(new URL('/login.html', request.url), request));
            return loginResponse;
        }
        
        // 处理主页请求
        if (isRootOrIndex) {
            const indexResponse = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
            return indexResponse;
        }
        
        // 处理其他静态资源
        try {
            const response = await env.ASSETS.fetch(request);
            if (response.status === 404) {
                // 如果资源不存在，返回主页
                return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
            }
            return response;
        } catch (err) {
            // 返回错误页面或主页
            return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
        }
    }
};
