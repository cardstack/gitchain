const { shellCommand }        = require('./utils/async');
const { restApiUrl }          = require('./utils/config');
const { submitAndPoll }       = require('./lib/send-transaction');
const { decodePayload }       = require('./utils/encryption');
const Git                     = require("nodegit");
const defaultLogger           = require('debug')('gitchain');
const request                 = require('request-promise-native');
const { get }                 = require('lodash');
const chdir                   = require('chdir');

const { writeToBlobStream, readFromBlobStream, blobStoreMeta }   = require('./lib/blob-storage');
const { transactionAddress, commitAddress }  = require("./utils/address");
const { readFileSync, existsSync, writeFileSync, mkdirSync }        = require('fs');
const { resolve, join, dirname }             = require('path');

class Gitchain {
  constructor(repoPath, keydir, { logger }) {
    this.repoPath   = repoPath;
    this.gitDir     = join(this.repoPath, '.git');
    this.keydir     = keydir;
    this.log        = logger || defaultLogger;
  }

  async storeCommit(commit) {
    this.log(`Storing commit ${commit.sha()}`);
    await writeToBlobStream(commit.sha(), this.readObject(commit.sha()));

    await this.storeTree(await commit.getTree());
  }

  async storeTree(tree) {
    await writeToBlobStream(tree.id().toString(), this.readObject(tree.id().toString()));

    for (let entry of tree.entries()) {
      if (entry.isTree()) {
        await this.storeTree(await entry.getTree());
      } else if (entry.isBlob()) {
        this.log(`Writing blob ${entry.name()} ${entry.sha()}`);
        await writeToBlobStream(entry.sha(), this.readObject(entry.sha()));
      }
    }
  }

  async downloadCommit(sha) {
    await this.downloadObject(sha);

    let commit = await this.repo.getCommit(sha);

    await this.downloadObject(commit.treeId().toString());
    let tree = await commit.getTree();

    await this.downloadTree(tree);
  }

  async downloadObject(sha) {
    this.log(`Downloading object ${sha}`);
    let buffer = await readFromBlobStream(sha);
    this.writeObject(sha, buffer);
  }

  async downloadTree(tree) {
    for (let entry of tree.entries()) {
      await this.downloadObject(entry.sha());
      if (entry.isTree()) {
        await this.downloadTree(await entry.getTree());
      }
    }
  }

  async gitCommand(cmd) {
    return await chdir(this.repoPath, async () =>
      await shellCommand(`git ${cmd}`)
    );
  }

  async push(commit) {
    let commits = await this.getCommits(this.gitDir, commit);
    let previousCommit;

    for (let commit of commits) {
      let previousCommitData;
      if (previousCommit) {
        previousCommitData = {
          type: 'COMMIT',
          id: previousCommit.sha()
        };
      }

      let transaction = {
        "type": "COMMIT",
        "id": commit.sha(),
        data: {
          attributes: {
            'blob-store-info': blobStoreMeta(),
          },
          relationships: {
            'previous-commit': {
              data: previousCommitData
            }
          }
        }
      };

      let privateKey = this.readPrivateKey();
      let batchData = await submitAndPoll({ privateKey, transaction });

      let commitTransaction = batchData.data.transactions[0];
      let commitPayload = decodePayload(commitTransaction.payload);
      let commitAddress = transactionAddress(commitPayload);

      await this.storeCommit(commit);

      previousCommit = commit;

      this.log("Transaction address", restApiUrl(`state/${commitAddress}`));
    }
  }

  async clone(headSha) {
    if (existsSync(this.repoPath)) {
      throw new Error(`Path ${this.repoPath} already exists!`);
    }

    this.repo = await Git.Repository.init(this.repoPath, 0);

    let currentSha = headSha;

    let commitData;
    do {
      commitData = await this.getCommitDataFromBlockchain(currentSha);
      await this.downloadCommit(commitData.id);
      currentSha = get(commitData, 'data.relationships.previous-commit.data.id');
    } while (currentSha);

    writeFileSync(join(this.gitDir, 'refs/heads/master'), headSha);
    this.gitCommand('reset --hard');
  }

  async getCommitDataFromBlockchain(sha) {
    let stateAddress = commitAddress(sha);
    let commit = await request(restApiUrl(`state/${stateAddress}`), {json: true});
    return decodePayload(commit.data);
  }

  async getCommits(repoPath, commit) {
    let repo = await Git.Repository.openBare(repoPath);
    let masterCommit;

    // if specific commit is provided, use that, otherwise use the current master
    // HEAD
    if (commit) {
      masterCommit = await repo.getCommit(commit);
    } else {
      masterCommit = await repo.getMasterCommit();
    }

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
    if (process.env.SAWTOOTH_PRIVATE_KEY) {
      return process.env.SAWTOOTH_PRIVATE_KEY;
    } else {
      return readFileSync(resolve(this.keydir, 'sawtooth.priv'), 'utf8');
    }
  }

  objectPath(sha) {
    return join(this.gitDir, 'objects', sha.slice(0,2), sha.slice(2));
  }

  readObject(sha) {
    return readFileSync(this.objectPath(sha));
  }

  writeObject(sha, buffer) {
    let destPath = this.objectPath(sha);
    let dir = dirname(destPath);

    if (!existsSync(dir)) { mkdirSync(dir); }

    writeFileSync(destPath, buffer);
  }

}

module.exports = { Gitchain };