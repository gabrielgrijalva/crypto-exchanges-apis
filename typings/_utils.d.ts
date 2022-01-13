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
   * UTILS OPTIONS
   * 
   * 
   * 
   */
  type utilsOptions = {
    symbol?: string;
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
  interface Utils {
    getOrderId(): string;
  }
}
export = UtilsN;
