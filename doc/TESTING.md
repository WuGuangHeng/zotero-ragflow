# RAGFlow 手动测试指南

## 准备工作

1. 在Zotero中安装插件
2. 打开Zotero开发者控制台: Tools -> Developer -> Error Console
3. 启用调试模式:
```javascript
// 启用调试模式
Zotero.RAGFlow.debug.enableDebug();

// 禁用调试模式
Zotero.RAGFlow.debug.disableDebug();

// 查看当前状态
Zotero.RAGFlow.debug.showState();
```

## 基本功能测试

### 1. API配置验证
```javascript
// 设置API地址和密钥
Zotero.RAGFlow.RAGFlowService.setBaseURL("http://your-api-server");
Zotero.RAGFlow.RAGFlowService.setApiKey("your-api-key");

// 验证配置
Zotero.RAGFlow.RAGFlowService.getBaseURL();
Zotero.RAGFlow.RAGFlowService.getApiKey();
```

### 2. UI切换功能

```javascript
// 查看当前UI版本
Zotero.RAGFlow.getCurrentUI();

// 切换到新版UI
await Zotero.RAGFlow.switchToNewUI();

// 切换回旧版UI
await Zotero.RAGFlow.switchToLegacyUI();
```

验证项:
- [ ] UI切换是否顺利完成
- [ ] UI元素是否正确显示
- [ ] 切换时是否有日志输出
- [ ] 错误处理是否正常

### 3. 故障恢复测试

1. 模拟配置错误:
```javascript
Zotero.RAGFlow.RAGFlowService.setBaseURL("http://invalid-url");
```

2. 模拟UI初始化错误:
```javascript
await Zotero.RAGFlow.uiManager.destroy();
await Zotero.RAGFlow.switchToNewUI();
```

验证项:
- [ ] 错误是否被正确捕获
- [ ] 是否自动回退到可用状态
- [ ] 日志中是否包含详细错误信息

### 4. 状态持久化

1. 切换到新版UI并设置一些状态
2. 重启Zotero
3. 验证项:
   - [ ] UI版本是否保持
   - [ ] API配置是否保持
   - [ ] 其他设置是否保持

## 调试技巧

### 1. 使用调试命令

```javascript
// 启用详细日志
Zotero.RAGFlow.debug.enableDebug();

// 查看系统状态
Zotero.RAGFlow.debug.showState();

// 完成调试后禁用
Zotero.RAGFlow.debug.disableDebug();
```

### 2. 观察日志输出

关注以下类型的日志:
- 初始化相关信息
- 状态变更记录
- 错误和警告信息
- UI切换过程

### 3. 状态检查

```javascript
// 检查UI管理器状态
Zotero.RAGFlow.uiManager.getCurrentVersion();
Zotero.RAGFlow.uiManager.getCurrentUI();

// 检查功能标记
Zotero.RAGFlow.VersionControl.isFeatureEnabled("use_new_ui");
```

## 常见问题排查

### 1. UI显示问题

- 检查DOM结构是否正确
- 验证CSS样式是否加载
- 确认事件监听器是否正常

### 2. 功能失效

- 检查API配置是否正确
- 验证功能标记状态
- 查看详细错误日志

### 3. 状态不一致

- 使用 debug.showState() 查看系统状态
- 检查localStorage中的持久化数据
- 验证Zotero首选项设置

## 反馈问题

提供以下信息:
1. 操作步骤
2. debug.showState() 输出
3. 错误控制台日志
4. Zotero和插件版本

## 重要提示

1. 进行破坏性测试前先备份数据
2. 记录重现步骤和错误信息
3. 使用调试模式获取详细日志
