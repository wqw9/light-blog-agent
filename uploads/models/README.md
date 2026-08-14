# Live2D 模型目录

把模型文件放在这里，例如：

```
uploads/models/
└─ MyModel/            ← 你的模型文件夹（名字随意）
   ├─ model.json       ← 模型入口（有些模型叫 model3.json，改 config 时写对文件名）
   ├─ xxx.moc3         ← 模型本体
   ├─ textures/        ← 贴图（PNG）
   ├─ xxx.physics3.json
   └─ motions/         ← 动作文件（可选）
```

## 使用步骤

1. 把整个模型文件夹放进 `uploads/models/`
2. 修改 `config/mascot.json`：

```json
{
  "enabled": true,
  "localModelPath": "/uploads/models/MyModel/model.json",
  "modelUrl": "https://model.oml2d.com/Pio/model.json"
}
```

- `localModelPath`：本地模型入口（填了就**优先使用本地**，找不到时自动回退到 CDN 的 `modelUrl`）
- 所有文件必须与 model.json 在**同一个文件夹**（model.json 里引用的相对路径）

## 模型来源

- [oh-my-live2d 官方模型仓库](https://github.com/oh-my-live2d/oh-my-live2d) 及 model.oml2d.com 上的免费模型（Pio、Shizuku 等）
- 其他站点的免费授权模型（注意版权：仅使用明确允许免费使用的模型）
- 自建模型：Live2D Cubism SDK 导出（model3.json 格式同样支持，改 localModelPath 指向它即可）
