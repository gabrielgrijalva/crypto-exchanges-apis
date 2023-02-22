const RestRequest = require('@gabrielgrijalva/rest-request');
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
      const requestConsumption = (params && params.requestConsumption) ? params.requestConsumption : 1;
      request.timestamps.push([Date.now() + restSettings.REQUESTS_REFILL_INTERVAL, requestConsumption]);
      request.remaining = request.remaining - requestConsumption;
      console.log('Request consumption: ', requestConsumption)
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
  const requestRefillCheck = setInterval(() => {
    let i = request.timestamps.length
    while (i--) {
      if (Date.now() >= request.timestamps[i][0]) { 
        request.remaining = request.remaining + request.timestamps[i][1];
        request.remaining = request.remaining > restSettings.REQUESTS_REFILL_LIMIT ? restSettings.REQUESTS_REFILL_LIMIT : request.remaining;
        request.timestamps.splice(i, 1);
      } 
    }
  }, 1000);
  requestRefillCheck;
  return request;
};
module.exports = Request;
