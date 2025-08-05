const fs = require('fs');
const path = require('path');

const tagsPath = path.join(__dirname, 'tag-config.json');

function loadTags() {
  try {
    const data = fs.readFileSync(tagsPath, 'utf-8');
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    // ignore
  }
  return {
    'LTE/5G': '#e6194b',
    'Radio TV': '#3cb44b',
    'Wisp Eolo': '#3388ff',
    Unknown: '#808080',
  };
}

function saveTags(newTags) {
  fs.writeFileSync(tagsPath, JSON.stringify(newTags, null, 2));
}

module.exports = { loadTags, saveTags };
