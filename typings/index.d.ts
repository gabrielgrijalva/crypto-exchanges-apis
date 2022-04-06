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
  FIXER(settings: FixerN.fixerSettings): FixerN.Fixer;
  POPULATOR(settings: PopulatorN.populatorSettings): PopulatorN.Populator;
  REST(settings: RestN.restSettings): RestN.Rest;
  UTILS(settings: UtilsN.utilsSettings): UtilsN.Utils;
  WS(settings: WsN.wsSettings): WsN.Ws;
}
declare function CryptoExchangesApi(exchange: exchanges): CryptoExchangeApi;
export = CryptoExchangesApi;
