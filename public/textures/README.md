# Texture Assets Directory

此目录存放3D场景使用的纹理图片资源。

## 目录结构

```
textures/
├── config-default.json      # 默认程序化纹理配置
├── config-realistic.json    # 写实纹理配置方案
├── ground/                  # 地面纹理 (推荐 2048×2048, PNG, ≤512KB)
├── wall/                    # 建筑墙体纹理 (推荐 1024×1024, PNG, ≤256KB)
├── roof/                    # 屋顶纹理 (推荐 512×512, PNG, ≤128KB)
└── fence/                   # 围墙纹理 (推荐 512×256, PNG, ≤64KB)
```

## 纹理规格要求

| 类型 | 尺寸 | 格式 | 最大大小 | 备注 |
|------|------|------|----------|------|
| 地面 | 2048×2048 | PNG/JPG/WebP | 512KB | 需可无缝平铺 |
| 墙体 | 1024×1024 | PNG/JPG/WebP | 256KB | 需可无缝平铺 |
| 屋顶 | 512×512 | PNG/JPG/WebP | 128KB | 需可无缝平铺 |
| 围墙 | 512×256 | PNG/JPG/WebP | 64KB | 水平可平铺 |

## 推荐的公开资源站点 (CC0)

- **Poly Haven** (https://polyhaven.com/textures) - CC0 高品质无缝纹理
- **AmbientCG** (https://ambientcg.com) - CC0 PBR 纹理
- **ShareTextures** (https://sharetextures.com) - 免费建筑纹理

## 使用方式

1. 下载 CC0 纹理并转换为推荐尺寸
2. 放入对应子目录
3. 在 `config-*.json` 中配置引用路径
4. 通过 API 或管理界面切换纹理方案
