const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
 
// SVGでアイコンを定義
const createSVG = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="rounded">
      <rect width="${size}" height="${size}" rx="${size * 0.22}" ry="${size * 0.22}"/>
    </clipPath>
  </defs>
  
  <!-- 背景 -->
  <rect width="${size}" height="${size}" fill="#000000" rx="${size * 0.22}" ry="${size * 0.22}"/>
  
  <!-- 肉球（テキストで描画） -->
  <text 
    x="${size * 0.5}" 
    y="${size * 0.52}" 
    font-size="${size * 0.68}" 
    text-anchor="middle" 
    dominant-baseline="middle"
    clip-path="url(#rounded)"
  >🐾</text>
  
  <!-- IKEDA -->
  <text
    x="${size * 0.5}"
    y="${size * 0.78}"
    font-size="${size * 0.13}"
    font-weight="800"
    font-family="Helvetica Neue, Arial, sans-serif"
    fill="#ffffff"
    text-anchor="middle"
    letter-spacing="${size * 0.012}"
  >IKEDA</text>
  
  <!-- CALENDAR -->
  <text
    x="${size * 0.5}"
    y="${size * 0.91}"
    font-size="${size * 0.085}"
    font-weight="600"
    font-family="Helvetica Neue, Arial, sans-serif"
    fill="#8E8E93"
    text-anchor="middle"
    letter-spacing="${size * 0.01}"
  >CALENDAR</text>
</svg>
`;
 
async function generateIcons() {
  const publicDir = path.join(__dirname, 'public');
  
  const sizes = [512, 192];
  
  for (const size of sizes) {
    const svg = Buffer.from(createSVG(size));
    const outputPath = path.join(publicDir, `logo${size}.png`);
    
    await sharp(svg)
      .png()
      .toFile(outputPath);
    
    console.log(`✓ logo${size}.png 生成完了`);
  }
  
  // favicon用に32pxも生成
  const svg32 = Buffer.from(createSVG(32));
  await sharp(svg32).png().toFile(path.join(publicDir, 'favicon.png'));
  console.log('✓ favicon.png 生成完了');
  
  console.log('\n全アイコン生成完了！');
}
 
generateIcons().catch(console.error);