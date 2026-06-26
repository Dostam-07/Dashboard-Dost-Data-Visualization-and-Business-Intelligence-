const fs = require("fs");
const path = require("path");

const walk = (dir) => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) { 
      results.push(file);
    }
  });
  return results;
};

const files = walk("./src");
const invalidShades = {
  101: 100,
  105: 100,
  150: 200,
  205: 200,
  250: 300,
  350: 400,
  450: 500,
  505: 500,
  550: 600,
  650: 700,
  750: 800,
  805: 800,
  850: 900,
  855: 900,
  905: 900,
  930: 950
};

files.forEach(file => {
  let content = fs.readFileSync(file, "utf8");
  let original = content;
  for (const [invalid, valid] of Object.entries(invalidShades)) {
    const regex = new RegExp(`-(${invalid})\\b`, "g");
    content = content.replace(regex, `-${valid}`);
  }
  if (content !== original) {
    fs.writeFileSync(file, content, "utf8");
    console.log(`Updated ${file}`);
  }
});
