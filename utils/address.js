const { hash }              = require('./signing');
const { GITCHAIN_NAMESPACE }   = require('./gitchain');

module.exports = { transactionAddress, stateModelNamespace, stateModelNamespaceFromAddress, commitAddress };

function transactionAddress(transaction) {
  return commitAddress(transaction.id);
}

function stateModelNamespace(transactionType) {
  return hash(transactionType).slice(0, 16);
}

function stateModelNamespaceFromAddress(address) {
  return address.slice(6, 22);
}

function commitAddress(sha) {
  return GITCHAIN_NAMESPACE + stateModelNamespace('COMMIT') + sha.padStart(48, '0');
}