const expect                      = require('chai').expect;
const { shellCommand }            = require("../utils/async");
const { cli, setupFixtureRepo }   = require('./test-helper');
const { Gitchain }                = require('../gitchain');
const { spy }                     = require('sinon');


describe("Caching", () => {
  beforeEach(async () => {
    await shellCommand("rm -rf tmp");
    await shellCommand("mkdir tmp");
  });




  it("Pushes using a cache", async() => {
    await cli("keygen -k tmp/some-key");
    await setupFixtureRepo('dummygit');



    let gitchain = new Gitchain('tmp/dummygit', 'tmp/some-key');
    let blobWriteSpy = spy(gitchain, 'writeToBlobStream');
    let blockchainPushSpy = spy(gitchain, 'writeCommitToBlockchain');

    await gitchain.push();

    // the first time, it should both write to the blockchain and the blob store
    expect(blobWriteSpy).to.have.callCount(16);
    expect(blockchainPushSpy).to.have.callCount(4);

    await gitchain.push();

    // the second time, it should have an internal cache and know not to push again
    expect(blobWriteSpy).to.have.callCount(16);
    expect(blockchainPushSpy).to.have.callCount(4);

    let gitchain2 = new Gitchain('tmp/dummygit', 'tmp/some-key', {cache: gitchain.cache});
    let blobWriteSpy2 = spy(gitchain2, 'writeToBlobStream');
    let blockchainPushSpy2 = spy(gitchain2, 'writeCommitToBlockchain');

    await gitchain2.push();

    // passing in a cache to a new instance should not write again
    expect(blobWriteSpy2).to.have.callCount(0);
    expect(blockchainPushSpy2).to.have.callCount(0);

    // a new instance gets its own cache if none is passed in
    let gitchain3 = new Gitchain('tmp/dummygit', 'tmp/some-key');
    let blobWriteSpy3 = spy(gitchain3, 'writeToBlobStream');
    let blockchainPushSpy3 = spy(gitchain3, 'writeCommitToBlockchain');

    await gitchain3.push();

    expect(blockchainPushSpy3).to.have.callCount(4);
    expect(blobWriteSpy3).to.have.callCount(16);

  }).timeout(20000).slow(6000);
});