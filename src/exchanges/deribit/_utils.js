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
  utils.getOrderId = () => uuid();
  utils.getOptionKindFromSymbol = (symbol) => symbol.split('-')[3] === 'C' ? 'call' : 'put';
  utils.getOptionStrikePxFromSymbol = (symbol) => +symbol.split('-')[2];
  return utils;
};
module.exports = Utils;
