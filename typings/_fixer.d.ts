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
   * FIXER PARAMS
   * 
   * 
   * 
   */
  type executeParams = {
    ws: Ws;
    rest: Rest;
    utils: Utils;
    qtyS: number;
    qtyB: number;
    type: 'limit' | 'market';
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
