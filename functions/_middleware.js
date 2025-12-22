// 中间件：检查用户是否已认证
export async function onRequest(context, next) {
    const { request, env } = context;
    const url = new URL(request.url);
    
    // 如果没有设置PASSWORD环境变量，则跳过认证
    if (!env.PASSWORD) {
        return next();
    }
    
    // 允许访问登录页面和验证接口
    if (url.pathname === '/login' || url.pathname === '/login.html' || url.pathname === '/api/verify-password') {
        return next();
    }
    
    // 检查认证状态
    const cookieHeader = request.headers.get('Cookie');
    const isAuthenticated = cookieHeader && cookieHeader.includes('authenticated=true');
    
    if (isAuthenticated) {
        // 用户已认证，继续处理请求
        return next();
    } else {
        // 用户未认证，重定向到登录页面
        return new Response(null, {
            status: 302,
            headers: {
                'Location': '/login.html'
            }
        });
    }
}