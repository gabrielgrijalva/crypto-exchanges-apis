const https = require('https');
const round = require('../_utils/round');
/**
 * @param {import('../../typings/_rest').Request} request 
 * @param {import('../../typings/settings')} settings
 */
function createRefillSetInterval(request, settings) {
  const timestamp = Date.now();
  const timeoutMilliseconds = round.up(timestamp / settings.REST.REQUESTS_REFILL_INTERVAL, 0)
    * settings.REST.REQUESTS_REFILL_INTERVAL - timestamp;
  const intervalRefillFunction = () => {
    request.remaining += request.remaining < settings.REST.REQUESTS_LIMIT
      ? settings.REST.REQUESTS_REFILL : 0;
    request.remaining = request.remaining >= settings.REST.REQUESTS_LIMIT
      ? settings.REST.REQUESTS_LIMIT : request.remaining;
  };
  setTimeout(() => {
    intervalRefillFunction();
    setInterval(intervalRefillFunction, settings.REST.REQUESTS_REFILL_INTERVAL);
  }, timeoutMilliseconds);
};
/** 
 * @param {import('../../typings/_rest').requestSettings} requestSettings
 */
function Request(requestSettings) {
  const key = requestSettings.key;
  const public = requestSettings.public;
  const private = requestSettings.private;
  const settings = requestSettings.settings;
  /** 
   * @type {import('../../typings/_rest').Request} 
   */
  const request = {
    // Variables
    remaining: settings.REST.REQUESTS_LIMIT,
    timestamps: [],
    // Functions
    send: (params) => {
      request.timestamps.unshift(Date.now());
      request.timestamps.splice(settings.REST.REQUESTS_TIMESTAMPS);
      request.remaining = request.remaining > 0 ? request.remaining - 1 : 0;
      return new Promise(resolve => {
        let data = '';
        const options = {
          method: params.method,
          headers: params.headers,
        };
        const req = https.request(params.url, options, (res) => {
          res.setEncoding('utf8');
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              data = JSON.parse(data);
            } catch (error) { }
            resolve({
              data: data,
              status: res.statusCode,
              headers: res.headers,
            });
          });
        });
        req.on('error', (error) => {
          console.log(`Problem with request: ${error.message}`);
          throw error;
        });
        req.end(params.data);
      });
    },
    key: key,
    public: public,
    private: private,
  };
  createRefillSetInterval(request, settings);
  return request;
};
module.exports = Request;
