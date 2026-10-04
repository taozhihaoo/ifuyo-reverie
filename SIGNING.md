# Signing — 代码签名架构（M11 §45/§46）

**当前状态：Unsigned Release（未签名）。** 本仓库不含且永不含任何私钥/证书/密码
（§46 硬约束）。

## 未来签名点（按 Release Pipeline 顺序）

1. `Reverie.exe`（Electron 运行时重命名副本）
2. `resources/app/**` 内的原生模块（当前无原生 DLL——纯 JS 栈暂无此项）
3. `Reverie-<version>-Setup.exe`（NSIS 安装器）
4. 卸载器（NSIS 自动随 installer 处理）

## 执行方式

- 工具：`signtool sign /fd SHA256 /tr <TSA> /td SHA256`（证书由购买渠道决定）。
- 注入：CI Secret 或本机安全存储（Windows 证书库），通过环境变量 `CSC_LINK` /
  `CSC_KEY_PASSWORD` 传给 electron-builder；脚本化打包读取同名变量调用 signtool。
- 时机：打包之后、生成 checksums/manifest 之前（checksum 覆盖签名后的最终字节）。

## 如实声明（§47）

未签名构建在 fresh Windows 上会触发 SmartScreen/Defender 提示（首次运行"仍要运行"
即可）。实际表现取决于签名信誉，**不做任何"无警告"承诺**；观察记录格式：

```
日期 | 构建 | 环境（Windows 版本） | 观察结果
```
