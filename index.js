const BinanceCoin = require('./src/exchanges/binance-coin');
const Bitmex = require('./src/exchanges/bitmex');
const Bybit = require('./src/exchanges/bybit');
const BybitFutures = require('./src/exchanges/bybit-futures');
const Deribit = require('./src/exchanges/deribit');
const KrakenFutures = require('./src/exchanges/kraken-futures');
const Okex = require('./src/exchanges/okex');
/**
 * @type {import('./typings')}
 */
function CryptoExchangesApi(settings) {
  if (exchange === 'binance-coin') {
    return BinanceCoin;
  }
  if (exchange === 'bitmex') {
    return Bitmex;
  }
  if (exchange === 'bybit') {
    return Bybit;
  }
  if (exchange === 'bybit-futures') {
    return BybitFutures;
  }
  if (exchange === 'deribit') {
    return Deribit;
  }
  if (exchange === 'kraken-futures') {
    return KrakenFutures;
  }
  if (exchange === 'okex') {
    return Okex;
  }
  throw new Error('Exchange not found.');
};
module.exports = CryptoExchangesApi;
