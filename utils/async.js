const util   = require('util');
const exec   = util.promisify(require('child_process').exec);
const delay  = require('await-delay');


module.exports = { shellCommand, pollCondition };

async function shellCommand(command) {
  let result = await exec(command);
  return result.stdout;
}

async function pollCondition(condition, timeout=30000) {
  let start = new Date();
  while (!await condition()) {
    if ( new Date() - start > timeout ) {
      throw new Error(`Timed out after ${timeout}ms`);
    }
    await delay(200);
  }
}
