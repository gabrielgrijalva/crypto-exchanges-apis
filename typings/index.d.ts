import FixerN = require('./_fixer');
import PopulatorN = require('./_populator');
import RestN = require('./_rest');
import UtilsN = require('./_utils');
import WsN = require('./_ws');
/**
 * 
 * 
 * 
 * EXPORTS IMPLEMENTATION
 * 
 * 
 * 
 */
type exchanges = 'binance-coin' | 'bitmex' | 'bitstamp' | 'bybit' | 'bybit-futures' | 'deribit' | 'kraken-futures' | 'okex';
interface CryptoExchangeApi {
  FIXER: FixerN.Fixer;
  POPULATOR: PopulatorN.Populator;
  REST: RestN.Rest;
  UTILS: UtilsN.Utils;
  WS: WsN.Ws;
}
declare function CryptoExchangesApi(exchange: exchanges): CryptoExchangeApi;
export = CryptoExchangesApi;
