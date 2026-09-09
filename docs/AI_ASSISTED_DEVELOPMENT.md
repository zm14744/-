# AI 辅助开发说明

## 项目研发方式

本项目开发全过程使用 OpenAI ChatGPT GPT-5.6 Sol 进行人工智能辅助开发。

AI 辅助覆盖：

- 产品需求与交互方案讨论；
- 软件架构设计；
- Python / JavaScript / HTML / CSS 代码生成与修改建议；
- Bug 定位与故障排查；
- OCR、数学公式渲染、PDF导出和上下文机制分析；
- 离散数学知识图谱初始结构设计；
- 数学知识内容校核与图谱修订；
- 测试用例设计；
- 技术资料与说明文档整理。

## 项目负责人职责

项目负责人朱明负责：

- 定义项目目标与实际需求；
- 决定功能取舍和产品交互；
- 审阅、选择和整合 AI 生成或建议的代码；
- 运行项目并定位实际行为；
- 进行代码迭代和版本管理；
- 部署云端服务；
- 执行功能自测；
- 对最终系统结果进行审查。

## 研发辅助模型与生产模型的区分

### 研发过程

```text
OpenAI ChatGPT GPT-5.6 Sol
```

作用：辅助研发与资料整理。

### 系统生产运行

文本生成：

```text
DeepSeek deepseek-v4-flash
```

图片结构理解：

```text
DeepSeek deepseek-v4-flash-vision-exp
```

OCR：

```text
PaddleOCR
PP-OCRv6_small_det
PP-OCRv6_small_rec
PP-FormulaNet_plus-S
```

因此，ChatGPT GPT-5.6 Sol 不属于当前网站运行时向最终用户提供回答的基础模型。

## 表述原则

项目材料采用“AI辅助开发”表述，不使用“全部代码由项目负责人纯手工编写”的表述；系统运行使用的 DeepSeek 与 PaddleOCR 均明确作为第三方模型/开源技术说明。
