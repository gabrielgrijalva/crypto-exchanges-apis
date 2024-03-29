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
type exchanges =
'binance-coin' | 
'binance-spot' |
'binance-usds' | 
'bitmex' | 
'bitstamp' | 
'bybit' | 
'bybit-usdt' |
'coinex' | 
'deribit' | 
'gateio' |
'kraken' | 
'okx' | 
'phemex' | 
'huobi-swap' | 
'bitget' | 
'kucoin';
interface CryptoExchangeApi {
  FIXER(fixerSettings: FixerN.fixerSettings): FixerN.Fixer;
  POPULATOR(populatorSettings: PopulatorN.populatorSettings): PopulatorN.Populator;
  REST(restSettings?: RestN.restSettings): RestN.Rest;
  UTILS(utilsSettings: UtilsN.utilsSettings): UtilsN.Utils;
  WS(wsSettings?: WsN.wsSettings): WsN.Ws;
}
declare function CryptoExchangesApi(exchange: exchanges): CryptoExchangeApi;
export = CryptoExchangesApi;
