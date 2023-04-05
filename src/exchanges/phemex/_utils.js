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
  utils.getOrderId = () => 'PhemexLeaderboard_' + uuid();
  return utils;
};
module.exports = Utils;
