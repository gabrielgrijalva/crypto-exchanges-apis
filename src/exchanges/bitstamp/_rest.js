const qs = require('qs');
const moment = require('moment');
const Request = require('../../_shared-classes/request');
/**
 * 
 * 
 * 
 * =================================
 * HELPER FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {import('../../../typings/_rest').params} params
 * @param {Object | string} responseData 
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData }}
 */
function handleResponseError(params, responseData) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.code === 'ETIMEDOUT' || responseData.code === 'ESOCKETTIMEDOUT') {
    type = 'request-timeout';
  }
  return {
    error: {
      type: type,
      params: params,
      exchange: responseData,
    }
  }
};
/**
 * @param {number} interval 
 * @returns {string | number}
 */
function getCandleResolution(interval) {
  if (interval === 60000) { return 60 };
  if (interval === 180000) { return 180 };
  if (interval === 300000) { return 300 };
  if (interval === 900000) { return 900 };
  if (interval === 1800000) { return 1800 };
  if (interval === 3600000) { return 3600 };
  if (interval === 7200000) { return 7200 };
  if (interval === 14400000) { return 14400 };
  if (interval === 21600000) { return 21600 };
  if (interval === 43200000) { return 43200 };
  if (interval === 86400000) { return 86400 };
  if (interval === 259200000) { return 259200 };
};
/**
 * 
 * 
 * 
 * =================================
 * REQUEST FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {import('../../../typings/settings')} settings 
 */
function getPublicFunction(settings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function public(method, path, data) {
    const dataStringified = qs.stringify(data);
    const requestSendParams = {
      url: `${settings.REST.URL}${path}?${dataStringified}`,
      method: method,
    };
    const response = await this.send(requestSendParams);
    return response;
  };
  return public;
};
/**
 * 
 * 
 * 
 * =================================
 * REST DEFINITION
 * =================================
 * 
 * 
 * 
 */
/** 
 * @param {import('../../../typings/settings')} settings
 */
function Rest(settings) {
  // Default rest settings values
  settings.REST.URL = settings.REST.URL || 'https://www.bitstamp.net';
  settings.REST.REQUESTS_LIMIT = settings.REST.REQUESTS_LIMIT || 8000;
  settings.REST.REQUESTS_REFILL = settings.REST.REQUESTS_REFILL || 8000;
  settings.REST.REQUESTS_REFILL_INTERVAL = settings.REST.REQUESTS_REFILL_INTERVAL || 600000;
  settings.REST.REQUESTS_TIMESTAMPS = settings.REST.REQUESTS_TIMESTAMPS || 10;
  // Request creation
  const public = getPublicFunction(settings);
  const request = Request({ settings, public, key: null });
  /** 
   * 
   * 
   * @type {import('../../../typings/_rest').Rest} 
   * 
   * 
   */
  const rest = {
    /**
     * 
     * 
     * REQUEST
     * 
     * 
     */
    request: request,
    /**
     * 
     * 
     * CREATE ORDER
     * 
     * 
     */
    createOrder: null,
    /**
     * 
     * 
     * CREATE ORDERS
     * 
     * 
     */
    createOrders: null,
    /**
     * 
     * 
     * CANCEL ORDER
     * 
     * 
     */
    cancelOrder: null,
    /**
     * 
     * 
     * CANCEL ORDERS
     * 
     * 
     */
    cancelOrders: null,
    /**
     * 
     * 
     * CANCEL ORDERS ALL
     * 
     * 
     */
    cancelOrdersAll: null,
    /**
     * 
     * 
     * UPDATE ORDER
     * 
     * 
     */
    updateOrder: null,
    /**
     * 
     * 
     * UPDATE ORDERS
     * 
     * 
     */
    updateOrders: null,
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: null,
    /**
     * 
     * 
     * GET CANDLES
     * 
     * 
     */
    getCandles: async (params) => {
      const data = {};
      data.step = getCandleResolution(params.interval);
      data.start = moment.utc(params.start).unix();
      data.limit = 1000;
      const response = await request.public('GET', `/api/v2/ohlc/${settings.SYMBOL}/`, data);
      if (+response.data.code) {
        return handleResponseError(params, response.data);
      }
      const candles = response.data.data.ohlc.map(v => {
        const candle = {};
        candle.timestamp = moment.unix(v.timestamp).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v.open;
        candle.high = +v.high;
        candle.low = +v.low;
        candle.close = +v.close;
        candle.volume = +v.volume;
        return candle;
      });
      return { data: candles };
    },
    /**
     * 
     * 
     * GET POSITION
     * 
     * 
     */
    getPosition: null,
    /**
     * 
     * 
     * GET LAST PRICE
     * 
     * 
     */
    getLastPrice: null,
    /**
     * 
     * 
     * GET LIQUIDATION
     * 
     * 
     */
    getLiquidation: null,
    /**
     * 
     * 
     * GET FUNDING RATES
     * 
     * 
     */
    getFundingRates: null,
  };
  return rest;
};
module.exports = Rest;