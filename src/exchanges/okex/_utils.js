const uuid = require('uuid').v4;
/**
 * 
 * 
 * 
 * =================================
 * UTILS DEFINITION
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {UtilsN.utilsOptions} [utilsOptions]
 */
function Utils(utilsOptions) {
  // Default utilsOptions values
  utilsOptions = utilsOptions || {};
  utilsOptions.symbol = utilsOptions.symbol || '';
  /**
   * 
   * 
   * 
   * @type {UtilsN.Utils}
   * 
   * 
   */
  const utils = {
    getOrderId: () => uuid().replace(/-/g, ''),
  };
  return utils;
};
module.exports = Utils;
