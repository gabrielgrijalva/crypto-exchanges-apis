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
    request.remaining += request.remaining < restSettings.REQUESTS_LIMIT
      ? restSettings.REQUESTS_REFILL : 0;
    request.remaining = request.remaining >= restSettings.REQUESTS_LIMIT
      ? restSettings.REQUESTS_LIMIT : request.remaining;
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
    remaining: restSettings.REQUESTS_LIMIT,
    timestamps: [],
    // Functions
    send: (params) => {
      request.timestamps.unshift(Date.now());
      request.timestamps.splice(restSettings.REQUESTS_TIMESTAMPS);
      request.remaining = request.remaining > 0 ? request.remaining - 1 : 0;
      return RestRequest.send(params);
    },
    key: key,
    public: public,
    private: private,
  };
  createRefillSetInterval(request, restSettings);
  return request;
};
module.exports = Request;
