const crypto            = require('crypto');
const fs                = require('fs');


module.exports = { hash, filehash };

function hash(x) {
  return crypto.createHash('sha512').update(x).digest('hex');
}

function filehash(path) {
  return hash(fs.readFileSync(path, 'utf8'));
}