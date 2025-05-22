// Supabase Edge Function - Webhook Handler
// 这个函数处理数据库触发器发送的请求，并调用外部 HTTP 端点

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WebhookPayload {
  request_id: string;
  table: string;
  operation: string;
  record: any;
  old_record?: any;
  timestamp: string;
}

interface WebhookResponse {
  success: boolean;
  message: string;
  request_id: string;
  processed_at: string;
}

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 初始化 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 解析请求体
    const payload: WebhookPayload = await req.json()
    
    console.log('Received webhook payload:', {
      request_id: payload.request_id,
      table: payload.table,
      operation: payload.operation,
      record_id: payload.record?.id
    })

    // 验证负载
    if (!payload.request_id || !payload.table || !payload.operation) {
      throw new Error('Invalid webhook payload')
    }

    // 根据不同的表和操作类型处理业务逻辑
    let webhookResult: any = null
    
    if (payload.table === 'user_events' && payload.operation === 'INSERT') {
      webhookResult = await handleUserEventWebhook(payload.record)
    } else if (payload.table === 'user_events' && payload.operation === 'UPDATE') {
      webhookResult = await handleUserEventUpdate(payload.record, payload.old_record)
    }

    // 更新原始记录的状态
    await updateRecordStatus(supabase, payload.record.id, 'success')

    // 记录成功日志
    await logWebhookResult(supabase, payload, 'success', webhookResult)

    const response: WebhookResponse = {
      success: true,
      message: 'Webhook processed successfully',
      request_id: payload.request_id,
      processed_at: new Date().toISOString()
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    )

  } catch (error) {
    console.error('Webhook processing error:', error)

    const errorResponse: WebhookResponse = {
      success: false,
      message: error.message || 'Unknown error occurred',
      request_id: 'unknown',
      processed_at: new Date().toISOString()
    }

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    )
  }
})

// 处理用户事件的 webhook
async function handleUserEventWebhook(record: any) {
  console.log('Processing user event webhook for record:', record.id)

  // 准备要发送到外部端点的数据
  const webhookData = {
    event_id: record.id,
    user_id: record.user_id,
    event_type: record.event_type,
    event_data: record.event_data,
    timestamp: record.created_at,
    source: 'supabase_webhook'
  }

  // 外部 HTTP 端点 URL（可以配置为环境变量）
  const externalWebhookUrl = Deno.env.get('EXTERNAL_WEBHOOK_URL') || 'https://httpbin.org/post'
  
  try {
    // 调用外部 HTTP 端点
    const response = await fetch(externalWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Supabase-Webhook-Handler/1.0',
        // 可以添加认证头
        'Authorization': `Bearer ${Deno.env.get('EXTERNAL_API_TOKEN') || 'demo-token'}`
      },
      body: JSON.stringify(webhookData)
    })

    if (!response.ok) {
      throw new Error(`External webhook failed: ${response.status} ${response.statusText}`)
    }

    const responseData = await response.json()
    console.log('External webhook success:', responseData)

    return {
      external_response: responseData,
      webhook_url: externalWebhookUrl,
      status: 'success'
    }

  } catch (error) {
    console.error('External webhook error:', error)
    throw new Error(`Failed to call external webhook: ${error.message}`)
  }
}

// 处理用户事件更新
async function handleUserEventUpdate(record: any, oldRecord: any) {
  console.log('Processing user event update for record:', record.id)

  // 检查是否有重要字段变更
  const importantFields = ['event_type', 'event_data', 'webhook_status']
  const changes: any = {}

  for (const field of importantFields) {
    if (record[field] !== oldRecord[field]) {
      changes[field] = {
        old: oldRecord[field],
        new: record[field]
      }
    }
  }

  if (Object.keys(changes).length > 0) {
    console.log('Important changes detected:', changes)
    
    // 这里可以调用不同的外部端点或执行不同的逻辑
    // 例如：通知管理员、更新缓存、同步到其他系统等
  }

  return {
    changes_detected: Object.keys(changes).length > 0,
    changes: changes,
    status: 'processed'
  }
}

// 更新记录状态
async function updateRecordStatus(supabase: any, recordId: number, status: string) {
  try {
    const { error } = await supabase
      .from('user_events')
      .update({ 
        webhook_status: status,
        processed_at: new Date().toISOString()
      })
      .eq('id', recordId)

    if (error) {
      console.error('Failed to update record status:', error)
    }
  } catch (error) {
    console.error('Error updating record status:', error)
  }
}

// 记录 webhook 结果
async function logWebhookResult(supabase: any, payload: WebhookPayload, status: string, result: any) {
  try {
    const { error } = await supabase
      .from('webhook_logs')
      .update({
        status: status,
        response_data: result,
        updated_at: new Date().toISOString()
      })
      .eq('request_id', payload.request_id)

    if (error) {
      console.error('Failed to log webhook result:', error)
    }
  } catch (error) {
    console.error('Error logging webhook result:', error)
  }
}

/* 
使用说明：

1. 部署这个 Edge Function：
   supabase functions deploy webhook-handler

2. 设置环境变量：
   supabase secrets set EXTERNAL_WEBHOOK_URL=https://your-external-endpoint.com/webhook
   supabase secrets set EXTERNAL_API_TOKEN=your-api-token

3. 在数据库中执行 setup.sql 创建表和触发器

4. 测试插入数据：
   INSERT INTO user_events (event_type, event_data) 
   VALUES ('user_signup', '{"email": "test@example.com", "name": "Test User"}')

5. 检查日志：
   SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 10;
*/
