const expect                                      = require('chai').expect;
const { writeToBlobStream, readFromBlobStream }   = require('../lib/blob-storage');
const { shellCommand }                            = require("../utils/async");

describe("Blob storage", () => {
  beforeEach(async () => {
    await shellCommand("rm -rf tmp");
    await shellCommand("mkdir tmp");
  });

  it("Stores to the blob storage", async () => {
    await writeToBlobStream("mykey", "data");
    expect((await readFromBlobStream("mykey")).toString()).to.equal("data");
  });
});