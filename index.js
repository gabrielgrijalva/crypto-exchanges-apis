/**
 * EXCHANGES
 */
const exchanges = [
  'binance-coin',
  'bitmex',
  'bitstamp',
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
    fixer: settings.FIXER ? require(`./src/exchanges/${exchange}/_fixer`)(settings) : null,
    populator: settings.POPULATOR ? require(`./src/exchanges/${exchange}/_populator`)(settings) : null,
    rest: settings.REST ? require(`./src/exchanges/${exchange}/_rest`)(settings) : null,
    utils: settings.UTILS ? require(`./src/exchanges/${exchange}/_utils`)(settings) : null,
    ws: settings.WS ? require(`./src/exchanges/${exchange}/_ws`)(settings) : null,
    settings: settings,
  }
};
module.exports = CryptoExchangesApi;
