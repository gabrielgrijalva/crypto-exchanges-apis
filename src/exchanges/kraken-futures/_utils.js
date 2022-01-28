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
 * @param {import('../../../typings/settings')} settings
 */
function Utils(settings) {
  const utils = UtilsFactory(settings);
  utils.getOrderId = () => `${settings.SYMBOL}-${uuid()}`;
  return utils;
};
module.exports = Utils;
