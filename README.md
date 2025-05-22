# Supabase 数据变更监听和 HTTP 回调演示

这个项目演示了如何在 Supabase 中实现数据变更监听，并在数据插入时自动调用外部 HTTP 端点。

## 项目概述

当有新数据插入到 Supabase 数据库表中时，系统会：
1. 通过数据库触发器感知到数据变更
2. 调用 Supabase Edge Function
3. Edge Function 向外部 HTTP 端点发送请求

## 技术架构

```
数据插入 → 数据库触发器 → Edge Function → 外部 HTTP 端点
```

## 快速开始

### 1. 环境准备

- Supabase 项目
- Node.js 环境
- Supabase CLI

### 2. 设置步骤

1. **创建数据库表和触发器**
   ```sql
   -- 执行 sql/setup.sql 中的脚本
   ```

2. **部署 Edge Function**
   ```bash
   supabase functions deploy webhook-handler
   ```

3. **测试数据插入**
   ```bash
   node test/test-insert.js
   ```

## 目录结构

```
├── README.md                 # 项目说明
├── sql/
│   ├── setup.sql            # 数据库表和触发器设置
│   └── cleanup.sql          # 清理脚本
├── supabase/
│   └── functions/
│       └── webhook-handler/
│           └── index.ts     # Edge Function 代码
├── test/
│   ├── test-insert.js       # 测试插入数据
│   └── webhook-server.js    # 测试用的 HTTP 服务器
├── docs/
│   ├── setup-guide.md       # 详细设置指南
│   └── troubleshooting.md   # 问题排查
└── examples/
    └── client-demo.html     # 前端演示页面
```

## 功能特性

- ✅ 数据库触发器自动监听数据变更
- ✅ Edge Function 处理业务逻辑
- ✅ HTTP 回调到外部端点
- ✅ 错误处理和重试机制
- ✅ 完整的测试用例

## 使用场景

- 用户注册后发送欢迎邮件
- 订单创建后通知库存系统
- 数据同步到第三方系统
- 实时通知和消息推送

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License
