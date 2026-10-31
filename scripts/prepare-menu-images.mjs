import {readFileSync,copyFileSync,writeFileSync} from 'node:fs';
import sharp from 'sharp';
const manifest=JSON.parse(readFileSync('docs/menu-image-sources.json','utf8'));
const output=[];
for(const {id,source} of manifest){
 copyFileSync(source,`output/imagegen/cafe-menu/${id}-hd.png`);
 const target=`public/menu/${id}-v1.webp`;
 await sharp(source).webp({quality:88,effort:5}).toFile(target);
 const m=await sharp(target).metadata();
 output.push({id,file:target,width:m.width,height:m.height});
}
writeFileSync('docs/menu-image-dimensions.json',JSON.stringify(output,null,2)+'\n');
console.log(output);
