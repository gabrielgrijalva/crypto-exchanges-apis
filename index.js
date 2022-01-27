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
  if (settings.EXCHANGE === 'binance-coin') {
    return BinanceCoin(settings);
  }
  if (settings.EXCHANGE === 'bitmex') {
    return Bitmex(settings);
  }
  if (settings.EXCHANGE === 'bybit') {
    return Bybit(settings);
  }
  if (settings.EXCHANGE === 'bybit-futures') {
    return BybitFutures(settings);
  }
  if (settings.EXCHANGE === 'deribit') {
    return Deribit(settings);
  }
  if (settings.EXCHANGE === 'kraken-futures') {
    return KrakenFutures(settings);
  }
  if (settings.EXCHANGE === 'okex') {
    return Okex(settings);
  }
  throw new Error('Exchange not found.');
};
module.exports = CryptoExchangesApi;
