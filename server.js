const Koa                           = require('koa');
const log                           = require('debug')('gitchain/http');
const Router                        = require('koa-router');
const koaBody                       = require('koa-body');
const { SERVER_PORT, restApiUrl }   = require('./utils/config');
const { commitAddress }             = require('./utils/address');
const request                       = require('request-promise-native');
const { decodePayload }             = require('./utils/encryption');

const app       = new Koa();
const router    = new Router();

app.use(koaBody());
app.use(async (ctx, next) => {
  const start = Date.now();
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.message;
    ctx.app.emit('error', err, ctx);
  }
  const ms = Date.now() - start;
  log(`[${ctx.status}] ${ctx.method} ${ctx.url} - ${ms}`);
});


router.get('/commit/:sha', async (ctx, next) => {

  let address = commitAddress(ctx.params.sha);

  let state = await request(restApiUrl(`state/${address}`), {json: true});
  let payload = decodePayload(state.data);


  ctx.body = payload;

  await next();
});

app
  .use(router.routes())
  .use(router.allowedMethods());

app.listen(SERVER_PORT);
log(`Server listening on port ${SERVER_PORT}`);
