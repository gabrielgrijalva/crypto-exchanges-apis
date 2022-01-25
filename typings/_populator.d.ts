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
   * POPULATOR PARAMS
   * 
   * 
   * 
   */
  type candlesParams = {
    table: string,
    symbol: string,
    interval: number,
    start: string,
    finish: string,
    waitRequest: number;
  };
  type candlesCronParams = {
    table: string,
    symbol: string,
    interval: number,
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
