const { commitAddress }                = require('../utils/address');

module.exports = {
  async preprocess(transaction/*, privateKey */) {
    transaction.meta = transaction.meta || {};
    transaction.meta.outputs = [commitAddress(transaction.id)];
  }
};