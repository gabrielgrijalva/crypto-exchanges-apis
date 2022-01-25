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
type exchanges = 'binance-coin' | 'bitmex' | 'bybit' | 'bybit-futures' | 'deribit' | 'kraken-futures' | 'okex';
type settings = {
  EXCHANGE: exchanges,
  SYMBOL: string,
  API_KEY?: string,
  API_SECRET?: string,
  API_PASSPHRASE?: string,
  INSTRUMENT: null | {
    TYPE: 'spot' | 'future',
    BALANCE_TYPE: 'base' | 'quote',
    QUANTITY_TYPE: 'base' | 'quote',
    PRICE_STEP: number,
    QUANTITY_VALUE: number,
    BASE_PRECISION: number,
    QUOTE_PRECISION: number,
    PRICE_PRECISION: number,
    QUANTITY_PRECISION: number,
  },
  POPULATOR: null | {
    PORT: number,
    HOST: string,
    USER: string,
    DATABASE: string,
    PASSWORD: string,
    TIMEZONE: string,
  },
  REST: null | {
    URL?: string,
    REQUESTS_LIMIT: number,
    REQUESTS_REFILL: number,
    REQUESTS_REFILL_TYPE: '' | 'discrete' | 'continouos',
    REQUESTS_REFILL_INTERVAL: number,
    REQUESTS_TIMESTAMPS: number,
  },
  UTILS: null | {

  },
  WS: null | {
    URL?: string,
  },
}
interface CryptoExchangeApi {
  populator: PopulatorN.Populator;
  rest: RestN.Rest;
  utils: UtilsN.Utils;
  ws: WsN.Ws;
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
declare function CryptoExchangesApi(settings: settings): CryptoExchangeApi;
export = CryptoExchangesApi;
