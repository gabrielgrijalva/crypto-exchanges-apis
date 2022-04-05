import { Ws } from './_ws';
import { Rest } from './_rest';
import { Utils } from './_utils';
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
    ws: Ws;
    rest: Rest;
    utils: Utils;
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
