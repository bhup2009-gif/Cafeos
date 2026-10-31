import sharp from 'sharp';
import {readFileSync} from 'node:fs';
const entries=JSON.parse(readFileSync('docs/menu-image-dimensions.json','utf8'));
const tiles=[];
for(let i=0;i<entries.length;i++){
 const {id,file}=entries[i];
 const photo=await sharp(file).resize(320,200,{fit:'contain',background:'#faf9f6'}).toBuffer();
 tiles.push({input:photo,left:(i%4)*320,top:Math.floor(i/4)*230});
 const label=Buffer.from(`<svg width="320" height="30"><rect width="320" height="30" fill="#faf9f6"/><text x="12" y="21" font-family="sans-serif" font-size="14" fill="#253b2a">${id}</text></svg>`);
 tiles.push({input:label,left:(i%4)*320,top:Math.floor(i/4)*230+200});
}
await sharp({create:{width:1280,height:Math.ceil(entries.length/4)*230,channels:3,background:'#faf9f6'}}).composite(tiles).png().toFile('docs/screenshots/menu-photo-contact-sheet.png');
