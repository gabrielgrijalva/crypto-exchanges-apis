/**
 * EXCHANGES
 */
const exchanges = [
  'binance-coin',
  'bitmex',
  'bybit',
  'bybit-futures',
  'deribit',
  'kraken-futures',
  'okex',
];
/**
 * @type {import('./typings')}
 */
function CryptoExchangesApi(settings) {
  const exchange = exchanges.find(v => v === settings.EXCHANGE);
  if (!exchange) throw new Error('Exchange not found.');
  const Populator = require(`./src/exchanges/${exchange}/_populator`);
  const Rest = require(`./src/exchanges/${exchange}/_rest`);
  const Utils = require(`./src/exchanges/${exchange}/_utils`);
  const Ws = require(`./src/exchanges/${exchange}/_ws`);
  return {
    populator: settings.POPULATOR ? Populator(settings) : null,
    rest: settings.REST ? Rest(settings) : null,
    utils: settings.UTILS ? Utils(settings) : null,
    ws: settings.WS ? Ws(settings) : null,
    settings: settings,
  }
};
module.exports = CryptoExchangesApi;
