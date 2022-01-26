const Populator = require('./_populator');
const Rest = require('./_rest');
const Utils = require('./_utils');
const Ws = require('./_ws');
/**
 * @type {import('../../../typings')}
 */
function CryptoExchangeApi(settings) {
  return {
    populator: Populator(settings),
    rest: Rest(settings),
    utils: Utils(settings),
    ws: Ws(settings),
  }
};
module.exports = CryptoExchangeApi;
