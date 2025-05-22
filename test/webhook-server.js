// 测试用的 HTTP 服务器
// 用于接收和测试 Supabase webhook 回调

const express = require('express')
const cors = require('cors')
const morgan = require('morgan')

const app = express()
const PORT = process.env.PORT || 3001

// 存储接收到的 webhook 数据
const webhookHistory = []

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(morgan('combined'))

// Webhook 接收端点
app.post('/webhook', (req, res) => {
  const timestamp = new Date().toISOString()
  const webhookData = {
    id: webhookHistory.length + 1,
    timestamp,
    headers: req.headers,
    body: req.body,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  }

  console.log('\n🎯 收到 Webhook 回调:')
  console.log('时间:', timestamp)
  console.log('IP:', req.ip)
  console.log('User-Agent:', req.get('User-Agent'))
  console.log('Content-Type:', req.get('Content-Type'))
  console.log('Authorization:', req.get('Authorization') ? '已提供' : '未提供')
  console.log('数据:', JSON.stringify(req.body, null, 2))

  // 保存到历史记录
  webhookHistory.push(webhookData)
  
  // 保持最近100条记录
  if (webhookHistory.length > 100) {
    webhookHistory.shift()
  }

  // 模拟不同的响应场景
  const eventType = req.body?.event_type
  
  switch (eventType) {
    case 'test_error':
      console.log('⚠️ 模拟错误响应')
      return res.status(500).json({
        success: false,
        message: 'Simulated error for testing',
        timestamp
      })
    
    case 'test_slow':
      console.log('⏱️ 模拟慢响应')
      setTimeout(() => {
        res.json({
          success: true,
          message: 'Slow response completed',
          timestamp,
          delay: '3000ms'
        })
      }, 3000)
      return
    
    default:
      console.log('✅ 正常响应')
      res.json({
        success: true,
        message: 'Webhook received successfully',
        timestamp,
        received_data: {
          event_type: eventType,
          event_id: req.body?.event_id,
          user_id: req.body?.user_id
        }
      })
  }
})

// 获取 webhook 历史记录
app.get('/webhooks', (req, res) => {
  const limit = parseInt(req.query.limit) || 20
  const offset = parseInt(req.query.offset) || 0
  
  const paginatedHistory = webhookHistory
    .slice()
    .reverse()
    .slice(offset, offset + limit)

  res.json({
    total: webhookHistory.length,
    limit,
    offset,
    data: paginatedHistory
  })
})

// 获取特定的 webhook 记录
app.get('/webhooks/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const webhook = webhookHistory.find(w => w.id === id)
  
  if (!webhook) {
    return res.status(404).json({
      success: false,
      message: 'Webhook not found'
    })
  }
  
  res.json(webhook)
})

// 清理历史记录
app.delete('/webhooks', (req, res) => {
  const count = webhookHistory.length
  webhookHistory.length = 0
  
  console.log(`🧹 清理了 ${count} 条 webhook 记录`)
  
  res.json({
    success: true,
    message: `Cleared ${count} webhook records`
  })
})

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    webhooks_received: webhookHistory.length
  })
})

// 统计信息端点
app.get('/stats', (req, res) => {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const recentHour = webhookHistory.filter(w => 
    new Date(w.timestamp) > oneHourAgo
  ).length

  const recentDay = webhookHistory.filter(w => 
    new Date(w.timestamp) > oneDayAgo
  ).length

  const eventTypes = {}
  webhookHistory.forEach(w => {
    const eventType = w.body?.event_type || 'unknown'
    eventTypes[eventType] = (eventTypes[eventType] || 0) + 1
  })

  res.json({
    total_webhooks: webhookHistory.length,
    last_hour: recentHour,
    last_24_hours: recentDay,
    event_types: eventTypes,
    server_uptime: process.uptime(),
    last_webhook: webhookHistory.length > 0 ? 
      webhookHistory[webhookHistory.length - 1].timestamp : null
  })
})

// 根路径 - 显示 API 文档
app.get('/', (req, res) => {
  res.json({
    name: 'Supabase Webhook Test Server',
    version: '1.0.0',
    endpoints: {
      'POST /webhook': 'Receive webhook callbacks',
      'GET /webhooks': 'Get webhook history (query: limit, offset)',
      'GET /webhooks/:id': 'Get specific webhook by ID',
      'DELETE /webhooks': 'Clear webhook history',
      'GET /health': 'Health check',
      'GET /stats': 'Statistics',
      'GET /': 'This API documentation'
    },
    webhook_url: `http://localhost:${PORT}/webhook`,
    total_received: webhookHistory.length
  })
})

// 启动服务器
app.listen(PORT, () => {
  console.log('\n🚀 Webhook 测试服务器启动成功!')
  console.log(`📡 监听端口: ${PORT}`)
  console.log(`🌐 Webhook URL: http://localhost:${PORT}/webhook`)
  console.log(`📊 管理面板: http://localhost:${PORT}`)
  console.log('\n可用端点:')
  console.log('  POST /webhook      - 接收 webhook 回调')
  console.log('  GET  /webhooks     - 查看 webhook 历史')
  console.log('  GET  /stats        - 查看统计信息')
  console.log('  GET  /health       - 健康检查')
  console.log('\n等待 Supabase webhook 回调...\n')
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\n👋 收到终止信号，正在关闭服务器...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('\n👋 收到中断信号，正在关闭服务器...')
  console.log(`📊 总共接收了 ${webhookHistory.length} 个 webhook 回调`)
  process.exit(0)
})

module.exports = app

/*
使用说明:

1. 安装依赖:
   npm install express cors morgan

2. 启动服务器:
   node webhook-server.js

3. 或指定端口:
   PORT=3001 node webhook-server.js

4. 在 Supabase Edge Function 中设置环境变量:
   EXTERNAL_WEBHOOK_URL=http://your-server.com:3001/webhook

5. 测试特殊场景:
   - 插入 event_type 为 'test_error' 的数据来测试错误处理
   - 插入 event_type 为 'test_slow' 的数据来测试超时处理

6. 查看接收到的数据:
   curl http://localhost:3001/webhooks

7. 查看统计信息:
   curl http://localhost:3001/stats
*/
