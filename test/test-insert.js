// 测试数据插入脚本
// 使用这个脚本来测试 Supabase webhook 功能

const { createClient } = require('@supabase/supabase-js')

// 配置 Supabase 连接
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project-ref.supabase.co'
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key'

const supabase = createClient(supabaseUrl, supabaseKey)

// 测试数据模板
const testEvents = [
  {
    event_type: 'user_signup',
    event_data: {
      email: 'john.doe@example.com',
      name: 'John Doe',
      source: 'web',
      plan: 'free'
    }
  },
  {
    event_type: 'user_login',
    event_data: {
      email: 'jane.smith@example.com',
      device: 'mobile',
      ip_address: '192.168.1.100'
    }
  },
  {
    event_type: 'purchase_completed',
    event_data: {
      user_id: 'user_123',
      product_id: 'prod_456',
      amount: 99.99,
      currency: 'USD',
      payment_method: 'credit_card'
    }
  },
  {
    event_type: 'subscription_created',
    event_data: {
      user_id: 'user_789',
      plan: 'premium',
      billing_cycle: 'monthly',
      trial_days: 14
    }
  }
]

// 主测试函数
async function runTests() {
  console.log('🚀 开始测试 Supabase Webhook 功能...\n')

  try {
    // 1. 测试数据库连接
    console.log('1. 测试数据库连接...')
    const { data: connectionTest, error: connectionError } = await supabase
      .from('user_events')
      .select('count(*)')
      .limit(1)

    if (connectionError) {
      throw new Error(`数据库连接失败: ${connectionError.message}`)
    }
    console.log('✅ 数据库连接成功\n')

    // 2. 插入测试事件
    console.log('2. 插入测试事件...')
    const results = []

    for (let i = 0; i < testEvents.length; i++) {
      const event = testEvents[i]
      console.log(`   插入事件 ${i + 1}: ${event.event_type}`)
      
      const { data, error } = await supabase
        .from('user_events')
        .insert(event)
        .select()

      if (error) {
        console.error(`   ❌ 插入失败: ${error.message}`)
        continue
      }

      if (data && data.length > 0) {
        console.log(`   ✅ 插入成功, ID: ${data[0].id}`)
        results.push(data[0])
      }

      // 等待一秒以便观察触发器效果
      await delay(1000)
    }

    console.log(`\n✅ 成功插入 ${results.length} 条测试数据\n`)

    // 3. 检查webhook状态
    console.log('3. 检查 webhook 处理状态...')
    await delay(3000) // 等待webhook处理

    const { data: statusData, error: statusError } = await supabase
      .from('user_events')
      .select('id, event_type, webhook_status, processed_at')
      .in('id', results.map(r => r.id))
      .order('created_at', { ascending: false })

    if (statusError) {
      console.error(`查询状态失败: ${statusError.message}`)
    } else {
      console.log('Webhook 处理状态:')
      console.table(statusData)
    }

    // 4. 检查webhook日志
    console.log('\n4. 检查 webhook 日志...')
    const { data: logData, error: logError } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (logError) {
      console.error(`查询日志失败: ${logError.message}`)
    } else {
      console.log('最近的 webhook 日志:')
      console.table(logData?.map(log => ({
        id: log.id,
        table_name: log.table_name,
        operation: log.operation,
        status: log.status,
        created_at: new Date(log.created_at).toLocaleString()
      })))
    }

    // 5. 获取统计信息
    console.log('\n5. 获取统计信息...')
    const { data: statsData, error: statsError } = await supabase
      .rpc('get_webhook_stats')

    if (statsError) {
      console.error(`获取统计失败: ${statsError.message}`)
    } else if (statsData && statsData.length > 0) {
      const stats = statsData[0]
      console.log('📊 Webhook 统计信息:')
      console.log(`   总事件数: ${stats.total_events}`)
      console.log(`   待处理: ${stats.pending_webhooks}`)
      console.log(`   成功: ${stats.successful_webhooks}`)
      console.log(`   失败: ${stats.failed_webhooks}`)
      console.log(`   最后事件时间: ${new Date(stats.last_event_time).toLocaleString()}`)
    }

    console.log('\n🎉 测试完成!')

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    process.exit(1)
  }
}

// 测试单个事件插入
async function testSingleEvent(eventType = 'test_event', eventData = {}) {
  console.log(`🧪 测试单个事件: ${eventType}`)
  
  try {
    const { data, error } = await supabase
      .from('user_events')
      .insert({
        event_type: eventType,
        event_data: eventData
      })
      .select()

    if (error) {
      throw error
    }

    console.log('✅ 事件插入成功:', data[0])
    return data[0]

  } catch (error) {
    console.error('❌ 事件插入失败:', error.message)
    throw error
  }
}

// 清理测试数据
async function cleanupTestData() {
  console.log('🧹 清理测试数据...')
  
  try {
    // 删除测试事件（保留最近1小时的数据）
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    
    const { error: eventsError } = await supabase
      .from('user_events')
      .delete()
      .lt('created_at', oneHourAgo)

    if (eventsError) {
      console.error('清理用户事件失败:', eventsError.message)
    }

    // 删除旧的webhook日志
    const { error: logsError } = await supabase
      .from('webhook_logs')
      .delete()
      .lt('created_at', oneHourAgo)

    if (logsError) {
      console.error('清理webhook日志失败:', logsError.message)
    }

    console.log('✅ 测试数据清理完成')

  } catch (error) {
    console.error('❌ 清理失败:', error.message)
  }
}

// 工具函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 命令行接口
if (require.main === module) {
  const command = process.argv[2]
  
  switch (command) {
    case 'single':
      const eventType = process.argv[3] || 'manual_test'
      const eventData = process.argv[4] ? JSON.parse(process.argv[4]) : { test: true, timestamp: new Date().toISOString() }
      testSingleEvent(eventType, eventData)
      break
    
    case 'cleanup':
      cleanupTestData()
      break
    
    default:
      runTests()
  }
}

module.exports = {
  runTests,
  testSingleEvent,
  cleanupTestData
}

/* 
使用说明:

1. 安装依赖:
   npm install @supabase/supabase-js

2. 设置环境变量:
   export SUPABASE_URL="https://your-project-ref.supabase.co"
   export SUPABASE_ANON_KEY="your-anon-key"

3. 运行完整测试:
   node test-insert.js

4. 测试单个事件:
   node test-insert.js single "user_signup" '{"email":"test@example.com"}'

5. 清理测试数据:
   node test-insert.js cleanup
*/
