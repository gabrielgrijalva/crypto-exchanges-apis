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
 * @type {import('./typings/index')}
 */
function CryptoExchangesApi(exchange) {
  if (!exchanges.find(v => v === exchange)) throw new Error('Exchange not found.');
  return {
    FIXER: require(`./src/exchanges/${exchange}/_fixer`),
    POPULATOR: require(`./src/exchanges/${exchange}/_populator`),
    REST: require(`./src/exchanges/${exchange}/_rest`),
    UTILS: require(`./src/exchanges/${exchange}/_utils`),
    WS: require(`./src/exchanges/${exchange}/_ws`),
  }
};
module.exports = CryptoExchangesApi;
