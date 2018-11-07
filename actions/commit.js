const cbor                    = require('cbor');

module.exports = function(publicKey, transaction, state) {
  const address = transaction.meta.outputs[0];

  return state.setState({
    [address]: cbor.encode(transaction)
  });
};
