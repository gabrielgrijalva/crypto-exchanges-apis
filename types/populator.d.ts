
declare namespace PopulatorN {
  /**
   * 
   * 
   * 
   * POPULATOR OPTIONS
   * 
   * 
   * 
   */
  type populatorOptions = {
    port?: number,
    host?: string,
    user?: string,
    database?: string,
    password?: string,
    timezone?: string,
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
