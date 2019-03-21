const cbor                    = require('cbor');
const { tagAddress, commitAddress } = require('../utils/address');
const { decodePayload } = require("../utils/encryption");

module.exports = async function(publicKey, transaction, state) {
  const address = tagAddress(transaction.id);

  let headSha = transaction.data.attributes['head-sha'];


  let previousCommitData;

  try {
    let currentTagState = decodePayload((await state.getState([address]))[address]);

    previousCommitData = {
      type: 'COMMIT',
      id: currentTagState.data.attributes['head-sha']
    };

  } catch(e) {
    // no previous state
  }



  let commit = {
    "type": "COMMIT",
    "id": headSha,
    data: {
      attributes: {
        'blob-store-info': transaction.data.attributes['blob-store-info'],
        'pack-sha': transaction.data.attributes['pack-sha'],
        'tag': transaction.id
      },
      relationships: {
        'previous-commit': {
          data: previousCommitData
        }
      }

    }
  };




  return state.setState({
    [address]: cbor.encode(transaction),
    [commitAddress(headSha)]: cbor.encode(commit)
  });
};
