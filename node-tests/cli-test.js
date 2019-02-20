const expect                      = require('chai').expect;
const { shellCommand }            = require("../utils/async");
const fs                          = require('fs');
const glob                        = require('fast-glob');
const Git                         = require('isomorphic-git');

const { cli, setupFixtureRepo, setupBareFixtureRepo }   = require('./test-helper');

describe("CLI", () => {
  beforeEach(async () => {
    await shellCommand("rm -rf tmp");
    await shellCommand("mkdir tmp");
  });

  it("generates sawtooth keys", async () => {
    await cli("keygen -k tmp/some-key");
    fs.accessSync("tmp/some-key/sawtooth.priv");
  });

  it("pushes a repo to the blockchain and restores it again", async() => {
    await cli("keygen -k tmp/some-key");
    await setupFixtureRepo('dummygit');
    let result = await cli("push -k tmp/some-key tmp/dummygit");

    // should return the head commit
    expect(result.type).to.equal("COMMIT");
    expect(result.id).to.equal("a47c8dc067a1648896f7de6759d25411f8f665a0");
    // stores the previous commit so you can walk back up the chain
    expect(result.data.relationships['previous-commit'].data.id).to.equal("247e877ae8a62139e3561fd95ac3cfa48cbfab97");

    // the objects should be stored in the object store
    let blobs = await glob('tmp/blobs/*');
    expect(blobs.length).to.equal(13);

    await cli("clone a47c8dc067a1648896f7de6759d25411f8f665a0 tmp/cloned");

    let fullRef = await Git.resolveRef({ dir: 'tmp/cloned', ref: 'master' });
    expect(fullRef).to.equal('a47c8dc067a1648896f7de6759d25411f8f665a0');

    let commits = await Git.log({ dir: 'tmp/cloned' });

    expect(commits.length).to.equal(4);

    expect(commits.map(c => c.oid)).to.deep.equal(["a47c8dc067a1648896f7de6759d25411f8f665a0", "247e877ae8a62139e3561fd95ac3cfa48cbfab97", "23e65d5097a41c4f6f9b2937f807c78296ea3298", "b5d928ed34f07b13cb2c664903b771b12ad2ca29"]);

    expect(fs.readFileSync('tmp/cloned/README', 'utf8')).to.equal("Hello World\n");

  }).timeout(20000).slow(4000);


  it("pushes a repo to the blockchain and restores it again when the repo uses packfiles", async() => {
    await cli("keygen -k tmp/some-key");
    await setupFixtureRepo('dummygit-packed');
    let result = await cli("push -k tmp/some-key tmp/dummygit-packed");

    // should return the head commit
    expect(result.type).to.equal("COMMIT");
    expect(result.id).to.equal("a47c8dc067a1648896f7de6759d25411f8f665a0");
    // stores the previous commit so you can walk back up the chain
    expect(result.data.relationships['previous-commit'].data.id).to.equal("247e877ae8a62139e3561fd95ac3cfa48cbfab97");

    // the objects should be stored in the object store
    let blobs = await glob('tmp/blobs/*');
    expect(blobs.length).to.equal(13);

    await cli("clone a47c8dc067a1648896f7de6759d25411f8f665a0 tmp/cloned");

    let fullRef = await Git.resolveRef({ dir: 'tmp/cloned', ref: 'master' });
    expect(fullRef).to.equal('a47c8dc067a1648896f7de6759d25411f8f665a0');

    let commits = await Git.log({ dir: 'tmp/cloned' });

    expect(commits.length).to.equal(4);

    expect(commits.map(c => c.oid)).to.deep.equal(["a47c8dc067a1648896f7de6759d25411f8f665a0", "247e877ae8a62139e3561fd95ac3cfa48cbfab97", "23e65d5097a41c4f6f9b2937f807c78296ea3298", "b5d928ed34f07b13cb2c664903b771b12ad2ca29"]);

    expect(fs.readFileSync('tmp/cloned/README', 'utf8')).to.equal("Hello World\n");

  }).timeout(20000).slow(4000);

  it("pushes a repo to the blockchain and restores it again when the repo has commits with multiple parents", async() => {
    await cli("keygen -k tmp/some-key");
    await setupFixtureRepo('repo-with-merge');
    let result = await cli("push -k tmp/some-key tmp/repo-with-merge");

    // should return the head commit
    expect(result.type).to.equal("COMMIT");
    expect(result.id).to.equal("93ae4072e3660b23b30b80cfc98620dfbe20ca85");
    // stores the previous commit so you can walk back up the chain
    expect(result.data.relationships['previous-commit'].data.id).to.equal("54663b63174fc953678bea90602f1cf44d86dc15");

    // the objects should be stored in the object store
    let blobs = await glob('tmp/blobs/*');
    expect(blobs.length).to.equal(22);

    await cli("clone 93ae4072e3660b23b30b80cfc98620dfbe20ca85 tmp/cloned");

    let fullRef = await Git.resolveRef({ dir: 'tmp/cloned', ref: 'master' });
    expect(fullRef).to.equal('93ae4072e3660b23b30b80cfc98620dfbe20ca85');

    let commits = await Git.log({ dir: 'tmp/cloned' });

    expect(commits.length).to.equal(7);


    expect(commits.map(c => c.oid)).to.deep.equal(["93ae4072e3660b23b30b80cfc98620dfbe20ca85", "54663b63174fc953678bea90602f1cf44d86dc15", "ce28caec25546c289f53ee749851848104e5e47f", "a47c8dc067a1648896f7de6759d25411f8f665a0", "247e877ae8a62139e3561fd95ac3cfa48cbfab97", "23e65d5097a41c4f6f9b2937f807c78296ea3298", "b5d928ed34f07b13cb2c664903b771b12ad2ca29"]);

    expect(fs.readFileSync('tmp/cloned/README', 'utf8')).to.equal("Hello World - version C\n");

  }).timeout(20000).slow(6000);

  it("shows the current status of pushing a repo to the blockchain if it is in progress", async() => {
    await cli("keygen -k tmp/some-key");
    await shellCommand("mkdir tmp/dummy-repo");

    await Git.init({ dir: 'tmp/dummy-repo' });

    let shas = [];

    for (let content of ["a", "b", "c", "d"]) {
      fs.writeFileSync("tmp/dummy-repo/content.txt", content);
      await Git.add({ dir: 'tmp/dummy-repo', filepath: 'content.txt' });

      let sha = await Git.commit({
        dir: 'tmp/dummy-repo',
        author: {
          name: 'Mr. Test',
          email: 'mrtest@example.com'
        },
        message: `Commit ${content}`
      });

      shas.push(sha);
    }

    let status = await cli("status -k tmp/some-key tmp/dummy-repo");

    expect(status.totalCommits).to.equal(4);
    expect(status.syncedCommits).to.equal(0);
    expect(status.percentage).to.equal(0);

    await cli(`push -k tmp/some-key tmp/dummy-repo -c ${shas[1]}`);

    status = await cli("status -k tmp/some-key tmp/dummy-repo");

    expect(status.totalCommits).to.equal(4);
    expect(status.syncedCommits).to.equal(2);
    expect(status.percentage).to.equal(50);

    await cli(`push -k tmp/some-key tmp/dummy-repo`);

    status = await cli("status -k tmp/some-key tmp/dummy-repo");
    expect(status.totalCommits).to.equal(4);
    expect(status.syncedCommits).to.equal(4);
    expect(status.percentage).to.equal(100);

  }).timeout(20000).slow(4000);

  it("works with bare repos", async() => {
    await cli("keygen -k tmp/some-key");
    await setupBareFixtureRepo('dummygit');
    let result = await cli("push -k tmp/some-key -c a47c8dc067a1648896f7de6759d25411f8f665a0 tmp/dummygit");

    // should return the head commit
    expect(result.type).to.equal("COMMIT");
    expect(result.id).to.equal("a47c8dc067a1648896f7de6759d25411f8f665a0");
    // stores the previous commit so you can walk back up the chain
    expect(result.data.relationships['previous-commit'].data.id).to.equal("247e877ae8a62139e3561fd95ac3cfa48cbfab97");

    // the objects should be stored in the object store
    let blobs = await glob('tmp/blobs/*');
    expect(blobs.length).to.equal(13);

    await cli("clone a47c8dc067a1648896f7de6759d25411f8f665a0 tmp/cloned");

    let fullRef = await Git.resolveRef({ dir: 'tmp/cloned', ref: 'master' });
    expect(fullRef).to.equal('a47c8dc067a1648896f7de6759d25411f8f665a0');

    let commits = await Git.log({ dir: 'tmp/cloned' });

    expect(commits.length).to.equal(4);

    expect(commits.map(c => c.oid)).to.deep.equal(["a47c8dc067a1648896f7de6759d25411f8f665a0", "247e877ae8a62139e3561fd95ac3cfa48cbfab97", "23e65d5097a41c4f6f9b2937f807c78296ea3298", "b5d928ed34f07b13cb2c664903b771b12ad2ca29"]);

    expect(fs.readFileSync('tmp/cloned/README', 'utf8')).to.equal("Hello World\n");

  }).timeout(20000).slow(4000);
});
