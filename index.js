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
  return {
    populator: settings.POPULATOR ? require(`./src/exchanges/${exchange}/_populator`) : null,
    rest: settings.REST ? require(`./src/exchanges/${exchange}/_rest`) : null,
    utils: settings.UTILS ? require(`./src/exchanges/${exchange}/_utils`) : null,
    ws: settings.WS ? require(`./src/exhcange/${exchange}/_ws`) : null,
  }
};
module.exports = CryptoExchangesApi;
