const fs = require('fs');
const path = require('path');

const tagsPath = path.join(__dirname, 'tag-config.json');
let tags = ["LTE/5G", "Radio TV", "Wisp Eolo", "Unknown"];

try {
  const data = fs.readFileSync(tagsPath, 'utf-8');
  const parsed = JSON.parse(data);
  if (Array.isArray(parsed)) {
    tags = parsed;
  }
} catch (err) {
  // use default tags if file missing or invalid
}

module.exports = tags;
