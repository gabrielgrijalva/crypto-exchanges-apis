const uuid = require('uuid').v4;
const UtilsFactory = require('../../_shared-classes/utils');
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
  const utils = UtilsFactory(utilsOptions);
  utils.getOrderId = () => uuid().replace(/-/g, '');
  return utils;
};
module.exports = Utils;
