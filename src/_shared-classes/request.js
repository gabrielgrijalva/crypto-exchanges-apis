const https = require('https');
const round = require('../_utils/round');
/**
 * @param {import('../../typings/_rest').Request} request 
 * @param {import('../../typings/_rest').restOptions} restOptions
 * @returns {void}
 */
function createRefillSetInterval(request, restOptions) {
  const timestamp = Date.now();
  const timeoutMilliseconds = round.up(timestamp / restOptions
    .requestsRefillInterval, 0) * restOptions.requestsRefillInterval - timestamp;
  const intervalRefillDiscrete = () => {
    request.remaining = restOptions.requestsRefill;
  };
  const intervalRefillContinouos = () => {
    request.remaining += request.remaining < restOptions.requestsLimit
      ? restOptions.requestsRefill : 0;
  };
  const intervalRefillFunction = restOptions.requestsRefillType === 'discrete'
    ? intervalRefillDiscrete : intervalRefillContinouos;
  setTimeout(() => {
    intervalRefillFunction();
    setInterval(intervalRefillFunction, restOptions.requestsRefillInterval);
  }, timeoutMilliseconds);
};
/** 
 * @param {import('../../typings/_rest').requestOptions} requestOptions 
 * @returns {import('../../typings/_rest').Request}
 */
function Request(requestOptions) {
  const restOptions = requestOptions.restOptions;
  /** 
   * @type {import('../../typings/_rest').Request} 
   */
  const request = {
    // Variables
    remaining: restOptions.requestsLimit,
    timestamps: [],
    restOptions: restOptions,
    // Functions
    send: (params) => {
      request.timestamps.unshift(Date.now());
      request.timestamps.splice(restOptions.requestsTimestamps);
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
          console.error(`Problem with request: ${error.message}`);
          throw error;
        });
        req.end(params.data);
      });
    },
    key: requestOptions.key,
    public: requestOptions.public,
    private: requestOptions.private,
  };
  if (restOptions.requestsRefillType) {
    createRefillSetInterval(request, restOptions);
  }
  return request;
};
module.exports = Request;
