import WsN from './_ws';
import RestN from './_rest';
import UtilsN from './_utils';
/**
 * 
 * 
 * 
 * FIXER IMPLEMENTATION
 * 
 * 
 * 
 */
declare namespace FixerN {
  /**
   * 
   * 
   * 
   * FIXER SETTINGS
   * 
   * 
   * 
   */
  type fixerSettings = {
    TYPE: 'spot' | 'future' | 'option';
    QUANTITY_MIN: number;
    QUANTITY_PRECISION: number;
  }
  /**
   * 
   * 
   * 
   * FIXER PARAMS
   * 
   * 
   * 
   */
  type executeParams = {
    ws: WsN.Ws;
    rest: RestN.Rest;
    utils: UtilsN.Utils;
    fixSymbol: string;
    fixPositionQtyS: number;
    fixPositionQtyB: number;
    fixPositionType: 'limit' | 'market';
  };
  /**
   * 
   * 
   * 
   * FIXER INTERFACE
   * 
   * 
   * 
   */
  interface Fixer {
    execute(params: executeParams): Promise<void>;
  }
}
export = FixerN;
