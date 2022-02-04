/**
 * 
 * 
 * 
 * CRYPTO EXCHANGE SETTINGS
 * 
 * 
 * 
 */
type exchanges = 'binance-coin' | 'bitmex' | 'bybit' | 'bybit-futures' | 'deribit' | 'kraken-futures' | 'okex';
type settings = {
  EXCHANGE: exchanges,
  ASSET: string,
  SYMBOL: string,
  API_KEY?: string,
  API_SECRET?: string,
  API_PASSPHRASE?: string,
  INSTRUMENT?: {
    TYPE?: 'spot' | 'future',
    BALANCE_TYPE?: 'base' | 'quote',
    QUANTITY_TYPE?: 'base' | 'quote',
    PRICE_STEP?: number,
    QUANTITY_VALUE?: number,
    BASE_PRECISION?: number,
    QUOTE_PRECISION?: number,
    BALANCE_PRECISION?: number,
    PRICE_PRECISION?: number,
    QUANTITY_PRECISION?: number,
  },
  POPULATOR?: {
    PORT?: number,
    HOST?: string,
    USER?: string,
    DATABASE?: string,
    PASSWORD?: string,
    TIMEZONE?: string,
  },
  REST?: {
    URL?: string,
    REQUESTS_LIMIT?: number,
    REQUESTS_REFILL?: number,
    REQUESTS_REFILL_INTERVAL?: number,
    REQUESTS_TIMESTAMPS?: number,
  },
  UTILS?: {
  },
  WS?: {
    URL?: string,
  },
}
export = settings;
