import { dataOrderBook } from "./_ws";

/**
 * 
 * 
 * 
 * UTILSN IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace UtilsN {
  /**
   * 
   * 
   * 
   * UTILS SETTINGS
   * 
   * 
   * 
   */
  type utilsSettings = {
    TYPE: 'spot' | 'future' | 'option',
    BALANCE_TYPE: 'base' | 'quote',
    QUANTITY_TYPE: 'base' | 'quote',
    PRICE_STEP: number,
    QUANTITY_VALUE: number,
    BASE_PRECISION: number,
    QUOTE_PRECISION: number,
    PRICE_PRECISION: number,
    QUANTITY_PRECISION: number,
  }
  /**
   * 
   * 
   * 
   * UTILS INTERFACE
   * 
   * 
   * 
   */
  type obTypes = 'asks' | 'bids';
  type sideTypes = 'sell' | 'buy';
  type roundTypes = 'up' | 'down' | 'normal';
  interface Utils {
    getOrderId(): string;
    getOpenOrderQtyFromBalance(px: number, qty: number, rnd: roundTypes): number;
    getCloseOrderQtyFromOpenPosition(px: number, qty: number, rnd: roundTypes): number;
    getOpenPositionQtyFromOpenExecution(px: number, qty: number, rnd: roundTypes): number;
    getPnl(qty: number, side: sideTypes, entPx: number, extPx: number, entFee: number, extFee: number): number;
    getOBBestAsk(ob: dataOrderBook): number;
    getOBBestBid(ob: dataOrderBook): number;
    getOBExecutionPrice(ob: dataOrderBook, obType: obTypes, bal: number, skipVol: number, skipLevles: number, skipPer: number): number;
    getBalInvFromPosition(px: number, qty: number): number;
    getNBValueFromPosition(px: number, qty: number): number;
    getNQValueFromPosition(px: number, qty: number): number;
    getChangePxByPercentage(px: number, per: number): number;
  }
}
export = UtilsN;
