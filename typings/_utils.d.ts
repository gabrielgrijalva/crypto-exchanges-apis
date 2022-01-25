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
    getBalInvFromPosition(px, qty): number;
    getNBValueFromPosition(px, qty): number;
    getNQValueFromPosition(px, qty): number;
  }
}
export = UtilsN;
