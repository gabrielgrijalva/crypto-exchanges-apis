import FixerN = require('./_fixer');
import PopulatorN = require('./_populator');
import RestN = require('./_rest');
import UtilsN = require('./_utils');
import WsN = require('./_ws');
import settings = require('./settings');
/**
 * 
 * 
 * 
 * EXPORTS IMPLEMENTATION
 * 
 * 
 * 
 */
interface CryptoExchangeApi {
  fixer: FixerN.Fixer;
  populator: PopulatorN.Populator;
  rest: RestN.Rest;
  utils: UtilsN.Utils;
  ws: WsN.Ws;
  settings: settings;
}
declare function CryptoExchangesApi(settings: settings): CryptoExchangeApi;
export = CryptoExchangesApi;
