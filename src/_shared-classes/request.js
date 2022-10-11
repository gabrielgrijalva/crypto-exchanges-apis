const RestRequest = require('@gabrielgrijalva/rest-request');
const round = require('../_utils/round');
/**
 * @param {import('../../typings/_rest').Request} request 
 * @param {import('../../typings/_rest').restSettings} restSettings
 */
function createRefillSetInterval(request, restSettings) {
  const timestamp = Date.now();
  const timeoutMilliseconds = round.up(timestamp / restSettings.REQUESTS_REFILL_INTERVAL, 0)
    * restSettings.REQUESTS_REFILL_INTERVAL - timestamp;
  const intervalRefillFunction = () => {
    request.remaining = (request.remaining + restSettings.REQUESTS_REFILL_AMOUNT) < restSettings.REQUESTS_REFILL_LIMIT
      ? request.remaining + restSettings.REQUESTS_REFILL_AMOUNT : restSettings.REQUESTS_REFILL_LIMIT;
  };
  setTimeout(() => {
    intervalRefillFunction();
    setInterval(intervalRefillFunction, restSettings.REQUESTS_REFILL_INTERVAL);
  }, timeoutMilliseconds);
};
/** 
 * @param {import('../../typings/_rest').requestSettings} requestSettings
 */
function Request(requestSettings) {
  const key = requestSettings.KEY;
  const public = requestSettings.PUBLIC;
  const private = requestSettings.PRIVATE;
  const restSettings = requestSettings.REST_SETTINGS;
  /** 
   * @type {import('../../typings/_rest').Request} 
   */
  const request = {
    // Variables
    remaining: restSettings.REQUESTS_REFILL_LIMIT,
    timestamps: [],
    // Functions
    send: (params) => {
      request.timestamps.unshift(Date.now());
      request.timestamps.splice(restSettings.REQUESTS_TIMESTAMPS);
      request.remaining = request.remaining > 0 ? request.remaining - params.requestConsumption : 0;
      console.log('Request consumption: ', params.requestConsumption)
      return RestRequest.send(params);
    },
    updateRequestLimit: (params) => {
      request.remaining = Number(params)
      console.log('Remaining requests: ', request.remaining)
    },
    key: key,
    public: public,
    private: private,
  };
  console.log('Initial requests: ', request.remaining)
  if (restSettings.REQUESTS_REFILL) { createRefillSetInterval(request, restSettings) };
  return request;
};
module.exports = Request;
