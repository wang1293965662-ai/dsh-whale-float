/**
 * install.mjs · dsh-client-ui-pet v2.0.0 —— 幂等把这套浮窗装进【本版本自己】
 *
 * 用法：
 *   node install.mjs --dry        # 只体检
 *   node install.mjs              # 真装
 *
 * 原则：目标 dshhome 从本文件位置往上推（绝不写死别的版本）；写 package.json 前先备份；装完自检。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));   // <dshhome>/profiles/node_modules/dsh-client-ui-pet
const HOME = path.resolve(HERE, '../../..');                  // → <dshhome>
const PKG = 'dsh-whale-float';
const DST = path.join(HOME, 'profiles/node_modules', PKG);
const WEBPKG = path.join(HOME, 'profiles/web/package.json');
const WEBPATCH = path.join(HOME, 'profiles/web/cordis.patch.yml');
const dry = process.argv.includes('--dry');
const log = (s) => console.log('  ' + s);
let changed = 0;

log('目标 dshhome: ' + HOME);
if (!fs.existsSync(path.join(HOME, 'profiles'))) { log('❌ 这里不是 dshhome，退出'); process.exit(1); }

/* 1) 整包复制（含 server/ 与字体、README、CHANGELOG） */
if (path.resolve(DST) === path.resolve(HERE)) log('[同] 已在目标位置（自装），跳过复制');
else if (dry) { log('[dry] 整包 -> ' + DST); changed++; }
else { fs.mkdirSync(path.dirname(DST), { recursive: true }); fs.cpSync(HERE, DST, { recursive: true, force: true }); log('[写] 整包 -> ' + DST); changed++; }

/* 2) 登记进 web 的 bundles */
const pkg = JSON.parse(fs.readFileSync(WEBPKG, 'utf8'));
const bundles = (((pkg.dsh || {}).profile || {}).bundles) || [];
if (bundles.includes(PKG)) log('[同] dsh.profile.bundles 已登记');
else if (dry) { log('[dry] bundles += ' + PKG); changed++; }
else {
  fs.writeFileSync(WEBPKG + '.bak-pet', fs.readFileSync(WEBPKG));
  bundles.push(PKG); pkg.dsh.profile.bundles = bundles;
  fs.writeFileSync(WEBPKG, JSON.stringify(pkg, null, 2) + '\n');
  log('[写] bundles += ' + PKG); changed++;
}

/* 3) 清掉 patch 层里重复的 insert（同 id 插两次 = 两个浮窗） */
if (fs.existsSync(WEBPATCH)) {
  const marker = '# 鲸鱼娘余额浮窗（前端浮窗插件';
  let yml = fs.readFileSync(WEBPATCH, 'utf8');
  if (yml.includes(marker) && yml.includes(PKG)) {
    if (dry) { log('[dry] 清理 patch 层重复 insert'); changed++; }
    else { fs.writeFileSync(WEBPATCH, yml.slice(0, yml.indexOf(marker)).trimEnd() + '\n'); log('[写] 清理 patch 层重复 insert'); changed++; }
  } else log('[同] patch 层无重复');
}

/* 4) 结构自检 */
const need = ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'server/用量服务.mjs'];
let bad = 0;
for (const rel of need) { const ok = fs.existsSync(path.join(HERE, rel)); if (!ok) bad++; log((ok ? '✅ ' : '❌ ') + rel); }
const client = fs.readFileSync(path.join(HERE, 'lib/client.js'), 'utf8');
const host = fs.readFileSync(path.join(HERE, 'lib/index.js'), 'utf8');
log((client.includes('__ModuleLoader__') && client.includes('exports.apply') ? '✅' : '❌') + ' client 形状（__ModuleLoader__ + exports.apply）');
log((/export\s+(function\s+)?apply/.test(host) ? '✅' : '❌') + ' host 形状（导出 apply）');
const fonts = fs.existsSync(path.join(HERE, 'server/字体')) ? fs.readdirSync(path.join(HERE, 'server/字体')).filter((f) => /\.(woff2|ttf)$/.test(f)) : [];
log((fonts.length ? '✅ ' : '❌ ') + '字体 ' + fonts.length + ' 个');

console.log('  → 变更 ' + changed + ' 处' + (dry ? '（dry run）' : '') + (bad ? '  ⚠️ 有 ' + bad + ' 项结构缺失' : ''));
process.exit(bad ? 1 : 0);
