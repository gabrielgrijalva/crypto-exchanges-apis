/**
 * EXCHANGES
 */
const exchanges = [
  'binance-coin',
  'binance-usds',
  'bitmex',
  'bitstamp',
  'bybit',
  'coinex',
  'deribit',
  'gateio-btc',
  'kraken',
  'okx',
  'phemex',
];
/**
 * @type {import('./typings/index')}
 */
function CryptoExchangesApi(exchange) {
  if (!exchanges.find(v => v === exchange)) throw new Error('Exchange not found.');
  return {
    // SHARED IMPLEMENTATIONS
    FIXER: (() => { try { return require(`./src/_shared-classes/fixer`) } catch (err) { return null } })(),
    POPULATOR: (() => { try { return require(`./src/_shared-classes/populator`) } catch (err) { return null } })(),
    // INDIVIDUAL IMPLEMENTATIONS
    REST: (() => { try { return require(`./src/exchanges/${exchange}/_rest`) } catch (err) { return null } })(),
    UTILS: (() => { try { return require(`./src/exchanges/${exchange}/_utils`) } catch (err) { return null } })(),
    WS: (() => { try { return require(`./src/exchanges/${exchange}/_ws`) } catch (err) { return null } })(),
  }
};
module.exports = CryptoExchangesApi;
