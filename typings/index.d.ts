import PopulatorN = require('./_populator');
import RestN = require('./_rest');
import UtilsN = require('./_utils');
import WsN = require('./_ws');
/**
 * 
 * 
 * 
 * EXCHANGEN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace ExchangeN {
  interface Exchange {
    Populator(options: PopulatorN.populatorOptions): PopulatorN.Populator;
    Rest(options: RestN.restOptions): RestN.Rest;
    Utils(options: UtilsN.utilsOptions): UtilsN.Utils;
    Ws(options: WsN.wsOptions): WsN.Ws;
  }
}
/**
 * 
 * 
 * 
 * EXPORTS IMPLEMENTATION
 * 
 * 
 * 
 */
type exchanges = 'binance-coin' | 'bitmex' | 'bybit' | 'bybit-futures' | 'deribit' | 'kraken-futures' | 'okex';
declare function CryptoExchangesApi(exchange: exchanges): ExchangeN.Exchange;
export = CryptoExchangesApi;
