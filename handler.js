const { TransactionProcessor }  = require('sawtooth-sdk/processor');
const { TransactionHandler }    = require('sawtooth-sdk/processor/handler');
const cbor                      = require('cbor');
const actions                   = require('./actions');
const logger                    = require('debug')('gitchain-handler');


const { GITCHAIN_FAMILY, GITCHAIN_VERSION, GITCHAIN_NAMESPACE }       = require('./utils/gitchain');


class GitchainHandler extends TransactionHandler {
  constructor() {
    super(GITCHAIN_FAMILY, [GITCHAIN_VERSION], [GITCHAIN_NAMESPACE]);
  }

  async apply(transactionProcessRequest, stateStore) {
    const {signerPubkey} = transactionProcessRequest.header;

    const transaction = cbor.decodeFirstSync(transactionProcessRequest.payload);

    const {type, id} = transaction;
    logger(`Processing ${type} transaction id ${id}`);

    const actionHandler = actions[type];

    if (!actionHandler) {
      throw new Error(`Unknown transaction type ${type}`);
    }

    let result = await actionHandler(signerPubkey, transaction, stateStore);
    logger(`Successfully processed ${type} transaction`);
    return result;
  }
}

const address = 'tcp://127.0.0.1:4004';
const transactionProcessor = new TransactionProcessor(address);
transactionProcessor.addHandler(new GitchainHandler());
transactionProcessor.start();
