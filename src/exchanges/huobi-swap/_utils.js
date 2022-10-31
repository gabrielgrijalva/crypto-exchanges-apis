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
 * @param {import('../../../typings/_utils').utilsSettings} utilsSettings
 */
function Utils(utilsSettings) {
  const utils = UtilsFactory(utilsSettings);
  utils.getOrderId = () => (Math.floor(Math.random() * 9223372036854775807)).toString();
  return utils;
};

module.exports = Utils;
