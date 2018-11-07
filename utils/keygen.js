const { createContext } = require('sawtooth-sdk/signing');

module.exports = { makeSawtoothKey };

function makeSawtoothKey() {
  let context = createContext('secp256k1');
  return context.newRandomPrivateKey();
}