export default {
    async onRequest(context) {
        const { request, env } = context;
        
        // 只允许 POST 请求
        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ message: 'Method not allowed' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 405
            });
        }
        
        try {
            // 解析请求体
            const { password } = await request.json();
            
            // 检查是否设置了 PASSWORD 环境变量
            if (!env.PASSWORD) {
                return new Response(JSON.stringify({ message: 'Password protection not configured' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 500
                });
            }
            
            // 验证密码
            if (password === env.PASSWORD) {
                // 创建响应并设置 cookie
                const response = new Response(JSON.stringify({ success: true }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 200
                });
                response.headers.append('Set-Cookie', 'authenticated=true; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
                return response;

            } else {
                return new Response(JSON.stringify({ message: 'Incorrect password' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 401
                });
            }
        } catch (error) {
            return new Response(JSON.stringify({ message: 'Invalid request' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
    }
};