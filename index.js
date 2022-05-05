/**
 * EXCHANGES
 */
const exchanges = [
  'binance-coin',
  'bitmex',
  'bitstamp',
  'bybit',
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
    FIXER: (() => { try { return require(`./src/exchanges/${exchange}/_fixer`) } catch (err) { return null } })(),
    POPULATOR: (() => { try { return require(`./src/exchanges/${exchange}/_populator`) } catch (err) { return null } })(),
    REST: (() => { try { return require(`./src/exchanges/${exchange}/_rest`) } catch (err) { return null } })(),
    UTILS: (() => { try { return require(`./src/exchanges/${exchange}/_utils`) } catch (err) { return null } })(),
    WS: (() => { try { return require(`./src/exchanges/${exchange}/_ws`) } catch (err) { return null } })(),
  }
};
module.exports = CryptoExchangesApi;
