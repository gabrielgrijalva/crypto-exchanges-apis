import RestN = require('./_rest');
/**
 * 
 * 
 * 
 * POPULATORN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace PopulatorN {
  /**
   * 
   * 
   * 
   * POPULATOR SETTINGS
   * 
   * 
   * 
   */
  type populatorSettings = {
    PORT?: number;
    HOST?: string;
    USER?: string;
    DATABASE?: string;
    PASSWORD?: string;
    TIMEZONE?: string;
  }
  /**
   * 
   * 
   * 
   * POPULATOR PARAMS
   * 
   * 
   * 
   */
  type candlesParams = {
    rest: RestN.Rest;
    symbol: string;
    table: string;
    interval: number;
    start: string;
    finish: string;
    waitRequest: number;
  };
  type candlesCronParams = {
    rest: RestN.Rest;
    symbol: string;
    table: string;
    interval: number;
  };
  /**
   * 
   * 
   * 
   * POPULATOR INTERFACE
   * 
   * 
   * 
   */
  interface Populator {
    candles(params: candlesParams): Promise<void>;
    candlesCron(params: candlesCronParams): void;
  };
}
export = PopulatorN;
