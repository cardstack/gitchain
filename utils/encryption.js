const crypto          = require('crypto');
const cbor            = require('cbor');


function randomKey() {
  return crypto.randomBytes(32).toString('hex');
}

function decodePayload(payload) {
  return cbor.decodeFirstSync(Buffer.from(payload, 'base64'));
}

module.exports = {
  randomKey,
  decodePayload
};