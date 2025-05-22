-- Supabase 数据变更监听演示 - 数据库设置脚本
-- 
-- 这个脚本创建了一个演示表和相关的触发器，用于监听数据变更并调用 Edge Function

-- 1. 创建演示表
CREATE TABLE IF NOT EXISTS public.user_events (
    id SERIAL PRIMARY KEY,
    user_id UUID DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    webhook_status VARCHAR(20) DEFAULT 'pending' -- pending, success, failed
);

-- 2. 创建索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON public.user_events(created_at);
CREATE INDEX IF NOT EXISTS idx_user_events_webhook_status ON public.user_events(webhook_status);
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON public.user_events(user_id);

-- 3. 启用行级安全策略（RLS）
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- 4. 创建策略允许所有操作（演示用，生产环境应该更严格）
CREATE POLICY "Allow all operations for demonstration" 
ON public.user_events 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 5. 创建触发器函数，用于调用 Edge Function
CREATE OR REPLACE FUNCTION public.handle_user_event_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    webhook_url TEXT;
    request_id UUID;
BEGIN
    -- 生成请求ID用于追踪
    request_id := gen_random_uuid();
    
    -- 构建webhook URL（需要替换为你的实际项目URL）
    webhook_url := 'https://your-project-ref.supabase.co/functions/v1/webhook-handler';
    
    -- 调用 Edge Function（异步）
    -- 使用 pg_net 扩展发送 HTTP 请求
    PERFORM
        net.http_post(
            url := webhook_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
            ),
            body := jsonb_build_object(
                'request_id', request_id,
                'table', TG_TABLE_NAME,
                'operation', TG_OP,
                'record', row_to_json(NEW),
                'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
                'timestamp', NOW()
            )
        );
    
    -- 记录调用日志
    INSERT INTO public.webhook_logs (
        table_name,
        operation,
        record_id,
        request_id,
        status,
        created_at
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        NEW.id,
        request_id,
        'sent',
        NOW()
    );
    
    RETURN NEW;
END;
$$;

-- 6. 创建webhook日志表
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    record_id INTEGER,
    request_id UUID,
    status VARCHAR(20) NOT NULL, -- sent, success, failed
    error_message TEXT,
    response_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. 创建触发器
DROP TRIGGER IF EXISTS trigger_user_event_webhook ON public.user_events;
CREATE TRIGGER trigger_user_event_webhook
    AFTER INSERT OR UPDATE ON public.user_events
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_event_webhook();

-- 8. 如果使用自定义的 HTTP 客户端方法（不依赖 pg_net）
-- 创建替代的触发器函数
CREATE OR REPLACE FUNCTION public.handle_user_event_webhook_simple()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 更新记录状态为待处理
    UPDATE public.user_events 
    SET webhook_status = 'pending'
    WHERE id = NEW.id;
    
    -- 这里可以设置一个标记，让 Edge Function 通过定时任务来处理
    -- 或者通过 Supabase 的实时功能来触发
    
    RETURN NEW;
END;
$$;

-- 9. 插入示例数据的函数
CREATE OR REPLACE FUNCTION public.create_sample_event(
    p_event_type VARCHAR(50) DEFAULT 'user_signup',
    p_event_data JSONB DEFAULT '{"email": "test@example.com", "name": "Test User"}'
)
RETURNS public.user_events
LANGUAGE plpgsql
AS $$
DECLARE
    new_event public.user_events;
BEGIN
    INSERT INTO public.user_events (event_type, event_data)
    VALUES (p_event_type, p_event_data)
    RETURNING * INTO new_event;
    
    RETURN new_event;
END;
$$;

-- 10. 查询函数用于监控
CREATE OR REPLACE FUNCTION public.get_webhook_stats()
RETURNS TABLE (
    total_events BIGINT,
    pending_webhooks BIGINT,
    successful_webhooks BIGINT,
    failed_webhooks BIGINT,
    last_event_time TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE webhook_status = 'pending') as pending_webhooks,
        COUNT(*) FILTER (WHERE webhook_status = 'success') as successful_webhooks,
        COUNT(*) FILTER (WHERE webhook_status = 'failed') as failed_webhooks,
        MAX(created_at) as last_event_time
    FROM public.user_events;
END;
$$;

-- 完成提示
SELECT 'Database setup completed successfully!' as message;

-- 显示创建的表
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('user_events', 'webhook_logs');
