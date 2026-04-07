const sharp = require('sharp');
const path = require('path');

const okSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="36" fill="#00d26a"/>
  <path d="M50 95 l30 30 l50 -55" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const troubleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="36" fill="#e74c3c"/>
  <g transform="translate(90,90)">
    <polygon points="0,-65 60,50 -60,50" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
    <rect x="-6" y="-30" width="12" height="38" rx="4" fill="#fff"/>
    <circle cx="0" cy="28" r="7" fill="#fff"/>
  </g>
</svg>`;

async function generate() {
  await sharp(Buffer.from(okSvg)).resize(180, 180).png().toFile(path.join(__dirname, 'public/icons/ok-180.png'));
  await sharp(Buffer.from(okSvg)).resize(512, 512).png().toFile(path.join(__dirname, 'public/icons/ok-512.png'));
  await sharp(Buffer.from(troubleSvg)).resize(180, 180).png().toFile(path.join(__dirname, 'public/icons/trouble-180.png'));
  await sharp(Buffer.from(troubleSvg)).resize(512, 512).png().toFile(path.join(__dirname, 'public/icons/trouble-512.png'));
  console.log('Icons generated!');
}

generate();
