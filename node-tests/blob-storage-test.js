const expect                                      = require('chai').expect;
const { writeToBlobStream, readFromBlobStream }   = require('../lib/blob-storage');
const { shellCommand }                            = require("../utils/async");

describe("Blob storage", () => {
  beforeEach(async () => {
    await shellCommand("rm -rf tmp");
    await shellCommand("mkdir tmp");
  });

  it("Stores to the blob storage", async () => {
    let config = {type: 'tmpfile', path: 'tmp/blobs'};
    await writeToBlobStream("mykey", "data", config);
    expect((await readFromBlobStream("mykey", config)).toString()).to.equal("data");
  });
});