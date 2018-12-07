const { shellCommand }        = require('./utils/async');
const { restApiUrl }          = require('./utils/config');
const { readFileSync }        = require('fs');
const { submitAndPoll }       = require('./lib/send-transaction');
const { decodePayload }       = require('./utils/encryption');
const { transactionAddress }  = require("./utils/address");
const Git                     = require("nodegit");
const { writeToBlobStream }   = require('./lib/blob-storage');
const { resolve }             = require('path');
const defaultLogger           = require('debug')('gitchain');

class Gitchain {
  constructor(repoPath, keydir, { logger }) {
    this.repoPath   = repoPath;
    this.keydir     = keydir;
    this.log        = logger || defaultLogger;
  }

  async storeCommit(commit) {
    let header = commit.rawHeader();
    this.log(`Storing commit ${commit.sha()}`);
    await writeToBlobStream(commit.sha(), header);

    await this.storeTree(await commit.getTree());
  }

  async storeTree(tree) {
    let rawTree = await this.gitCommand(`cat-file -p ${tree.id()}`);
    await writeToBlobStream(tree.id().toString(), rawTree);

    for (let entry of tree.entries()) {
      if (entry.isTree()) {
        await this.storeTree(await entry.getTree());
      } else if (entry.isBlob()) {
        let blob = await entry.getBlob();
        this.log(`Writing blob ${entry.name()} ${entry.sha()}`);
        let content;
        if (blob.isBinary()) {
          content = blob.rawcontent().toBuffer(blob.rawsize());
        } else {
          content = blob.toString();
        }
        await writeToBlobStream(entry.sha(), content);
      }
    }
  }

  async gitCommand(cmd) {
    return await shellCommand(`git --git-dir=${this.repoPath} ${cmd}`);
  }

  async push(commit) {
    let commits = await this.getCommits(this.repoPath, commit);

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

      await this.storeCommit(commit);

      this.log("Transaction address", restApiUrl(`state/${commitAddress}`));
    }
  }

  async getCommits(repoPath, commit) {
    let repo = await Git.Repository.openBare(repoPath);
    let masterCommit = await repo.getCommit(commit);
    return await new Promise((resolve, reject) => {
      let eventEmitter = masterCommit.history(Git.Revwalk.SORT.REVERSE);
      eventEmitter.on('end', commits => {
        resolve(commits);
      });
      eventEmitter.on('error', reject);
      eventEmitter.start();
    });
  }

  readPrivateKey() {
    return readFileSync(resolve(this.keydir, 'sawtooth.priv'), 'utf8');
  }

}

module.exports = { Gitchain };