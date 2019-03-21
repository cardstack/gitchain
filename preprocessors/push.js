const { tagAddress, commitAddress } = require('../utils/address');

module.exports = {
  async preprocess(transaction/*, privateKey */) {
    transaction.meta = transaction.meta || {};

    transaction.meta.outputs = [tagAddress(transaction.id), commitAddress(transaction.data.attributes['head-sha'])];
    transaction.meta.inputs = [tagAddress(transaction.id)];
  }
};