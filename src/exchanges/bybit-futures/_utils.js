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
 * @param {import('../../../typings/_utils').utilsOptions} [utilsOptions]
 */
function Utils(utilsOptions) {
  // Default utilsOptions values
  utilsOptions = utilsOptions || {};
  utilsOptions.symbol = utilsOptions.symbol || '';
  /**
   * 
   * 
   * 
   * @type {import('../../../typings/_utils').Utils}
   * 
   * 
   */
  const utils = {
    getOrderId: () => uuid(),
  };
  return utils;
};
module.exports = Utils;
