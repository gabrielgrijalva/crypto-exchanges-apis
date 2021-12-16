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
    getOrderId: () => `${utilsOptions.symbol}-${uuid()}`,
  };
  return utils;
};
module.exports = Utils;
