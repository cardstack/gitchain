const { makeSawtoothKey }             = require('./utils/keygen');
const { resolve }                     = require('path');
const util                            = require('util');
const writeFile                       = util.promisify(require('fs').writeFile);
const { readFileSync }                = require('fs');
const { submitAndPoll }               = require('./lib/send-transaction');
const { decodePayload }               = require('./utils/encryption');
const { shellCommand }                = require('./utils/async');
const options                         = require('options-parser');
const { transactionAddress }          = require("./utils/address");
const logger                          = require('debug')('gitchain-cli');
const Git                             = require("nodegit");
const { restApiUrl }                  = require('./utils/config');


class CLI {
  constructor(parsed, log=logger) {
    this.command = parsed.args[0];
    this.arguments = parsed.args.slice(1);
    this.options = parsed.opt;
    this.log = log;
  }

  async execute() {
    return await this[this.command].call(this);
  }

  async push () {
    let [repoPath] = this.arguments;

    let commits = await this.getCommits(repoPath);

    for (let commit of commits) {
      let transaction = {
        "type": "COMMIT",
        "id": commit.sha()
      };

      let privateKey = this.readPrivateKey();
      let batchData = await submitAndPoll({ privateKey, transaction });

      let commitTransaction = batchData.data.transactions[0];
      let commitPayload = decodePayload(commitTransaction.payload);
      let commitAddress = transactionAddress(commitPayload);

      this.log("Transaction address", restApiUrl(`state/${commitAddress}`));
    }
  }

  async benchmark() {
    for (let i=1; i < 100; i++) {
      this.log(`Attempting ${i}Kb transaction…`);
      let size = i * 1024;
      let transaction = {
        "type": "COMMIT",
        "id": `abcde${i}`,
        data: 'A'.repeat(size)
      };

      let privateKey = this.readPrivateKey();
      await submitAndPoll({ privateKey, transaction });

      this.log("It worked!");
    }
  }
  async getCommits(repoPath) {
    let repo = await Git.Repository.open(repoPath);
    let masterCommit = await repo.getMasterCommit();
    return await new Promise((resolve, reject) => {
      let eventEmitter = masterCommit.history(Git.Revwalk.SORT.REVERSE);
      eventEmitter.on('end', commits => {
        resolve(commits);
      });
      eventEmitter.on('error', reject);
      eventEmitter.start();
    });
  }

  async keygen() {
    await shellCommand(`mkdir -p "${this.options.keydir}"`);

    let privateKey = makeSawtoothKey();
    let privateKeyPath = resolve(this.options.keydir, 'sawtooth.priv');


    await writeFile(privateKeyPath, privateKey.privateKeyBytes.hexSlice());
  }


  readPrivateKey() {
    return readFileSync(resolve(this.options.keydir, 'sawtooth.priv'), 'utf8');
  }
}

const opts = {
  keydir: {
    required: true,
    short: 'k'
  }
};

module.exports = { CLI, opts };

if (require.main.filename === __filename) {
  let parsedOpts = options.parse(opts);
  // eslint-disable-next-line no-console
  new CLI(parsedOpts, console.log).execute();
}